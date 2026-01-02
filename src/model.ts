import Tableau from "./tableau/tableau";
import { Constraint, Equality, IntegerVariable, Variable } from "./expressions";
import type { Priority } from "./expressions";
import type { BranchAndCutService } from "./tableau/branch-and-cut";
import type { ConstraintBound, Model as JsonModel } from "./types/solver";
import type { TableauSolution, TableauSolutionSet } from "./tableau";

type ConstraintDefinition = ConstraintBound | ConstraintBound & { equal?: number };

class Model {
    tableau: Tableau;
    name?: string;
    variables: Variable[];
    integerVariables: IntegerVariable[];
    unrestrictedVariables: Record<number, boolean>;
    constraints: Constraint[];
    nConstraints: number;
    nVariables: number;
    isMinimization: boolean;
    tableauInitialized: boolean;
    relaxationIndex: number;
    useMIRCuts: boolean;
    checkForCycles: boolean;
    messages: unknown[];
    tolerance?: number;
    timeout?: number;
    keep_solutions?: boolean;
    solutions?: TableauSolutionSet[];
    availableIndexes: number[];
    lastElementIndex: number;

    constructor(precision?: number, name?: string, branchAndCutService?: BranchAndCutService) {
        this.tableau = new Tableau(precision, branchAndCutService);

        this.name = name;

        this.variables = [];

        this.integerVariables = [];

        this.unrestrictedVariables = {};

        this.constraints = [];

        this.nConstraints = 0;

        this.nVariables = 0;

        this.isMinimization = true;

        this.tableauInitialized = false;

        this.relaxationIndex = 1;

        this.useMIRCuts = false;

        this.checkForCycles = true;

        //
        // Quick and dirty way to leave useful information
        // for the end user without hitting the console
        // or modifying the primary return object...
        //
        this.messages = [];

        this.availableIndexes = [];
        this.lastElementIndex = 0;
    }

    minimize(): this {
        this.isMinimization = true;
        return this;
    }

    maximize(): this {
        this.isMinimization = false;
        return this;
    }

    // Model.prototype.addConstraint = function (constraint) {
    //     // TODO: make sure that the constraint does not belong do another model
    //     // and make
    //     this.constraints.push(constraint);
    //     return this;
    // };

    _getNewElementIndex(): number {
        if (this.availableIndexes.length > 0) {
            return this.availableIndexes.pop() as number;
        }

        const index = this.lastElementIndex;
        this.lastElementIndex += 1;
        return index;
    }

    _addConstraint(constraint: Constraint): void {
        const slackVariable = constraint.slack;
        this.tableau.variablesPerIndex[slackVariable.index] = slackVariable;
        this.constraints.push(constraint);
        this.nConstraints += 1;
        if (this.tableauInitialized === true) {
            this.tableau.addConstraint(constraint);
        }
    }

    smallerThan(rhs: number): Constraint {
        const constraint = new Constraint(rhs, true, this.tableau.getNewElementIndex(), this);
        this._addConstraint(constraint);
        return constraint;
    }

    greaterThan(rhs: number): Constraint {
        const constraint = new Constraint(rhs, false, this.tableau.getNewElementIndex(), this);
        this._addConstraint(constraint);
        return constraint;
    }

    equal(rhs: number): Equality {
        const constraintUpper = new Constraint(rhs, true, this.tableau.getNewElementIndex(), this);
        this._addConstraint(constraintUpper);

        const constraintLower = new Constraint(rhs, false, this.tableau.getNewElementIndex(), this);
        this._addConstraint(constraintLower);

        return new Equality(constraintUpper, constraintLower);
    }

    addVariable(
        cost?: number | null,
        id?: string | null,
        isInteger?: boolean,
        isUnrestricted?: boolean,
        priority?: Priority | null
    ): Variable {
        if (typeof priority === "string") {
            switch (priority) {
            case "required":
                priority = 0;
                break;
            case "strong":
                priority = 1;
                break;
            case "medium":
                priority = 2;
                break;
            case "weak":
                priority = 3;
                break;
            default:
                priority = 0;
                break;
            }
        }

        const varIndex = this.tableau.getNewElementIndex();
        const identifier = id ?? "v" + varIndex;
        const normalizedCost = cost ?? 0;
        const normalizedPriority = priority ?? 0;

        let variable: Variable;
        if (isInteger) {
            const integerVariable = new IntegerVariable(
                identifier,
                normalizedCost,
                varIndex,
                normalizedPriority
            );
            this.integerVariables.push(integerVariable);
            variable = integerVariable;
        } else {
            variable = new Variable(identifier, normalizedCost, varIndex, normalizedPriority);
        }

        this.variables.push(variable);
        this.tableau.variablesPerIndex[varIndex] = variable;

        if (isUnrestricted) {
            this.unrestrictedVariables[varIndex] = true;
        }

        this.nVariables += 1;

        if (this.tableauInitialized === true) {
            this.tableau.addVariable(variable);
        }

        return variable;
    }

    _removeConstraint(constraint: Constraint): void {
        const idx = this.constraints.indexOf(constraint);
        if (idx === -1) {
            console.warn("[Model.removeConstraint] Constraint not present in model");
            return;
        }

        this.constraints.splice(idx, 1);
        this.nConstraints -= 1;

        if (this.tableauInitialized === true) {
            this.tableau.removeConstraint(constraint);
        }

        if (constraint.relaxation) {
            this.removeVariable(constraint.relaxation);
        }
    }

    //-------------------------------------------------------------------
    // For dynamic model modification
    //-------------------------------------------------------------------
    removeConstraint(constraint: Constraint | Equality): this {
        if ((constraint as Equality).isEquality) {
            const equalityConstraint = constraint as Equality;
            this._removeConstraint(equalityConstraint.upperBound);
            this._removeConstraint(equalityConstraint.lowerBound);
        } else {
            this._removeConstraint(constraint as Constraint);
        }

        return this;
    }

    removeVariable(variable: Variable): this | void {
        const idx = this.variables.indexOf(variable);
        if (idx === -1) {
            console.warn("[Model.removeVariable] Variable not present in model");
            return;
        }
        this.variables.splice(idx, 1);

        if (this.tableauInitialized === true) {
            this.tableau.removeVariable(variable);
        }

        return this;
    }

    updateRightHandSide(constraint: Constraint, difference: number): this {
        if (this.tableauInitialized === true) {
            this.tableau.updateRightHandSide(constraint, difference);
        }
        return this;
    }

    updateConstraintCoefficient(constraint: Constraint, variable: Variable, difference: number): this {
        if (this.tableauInitialized === true) {
            this.tableau.updateConstraintCoefficient(constraint, variable, difference);
        }
        return this;
    }

    setCost(cost: number, variable: Variable): this {
        let difference = cost - variable.cost;
        if (this.isMinimization === false) {
            difference = -difference;
        }

        variable.cost = cost;
        this.tableau.updateCost(variable, difference);
        return this;
    }

    //-------------------------------------------------------------------
    //-------------------------------------------------------------------
    loadJson(jsonModel: JsonModel): this {
        this.isMinimization = jsonModel.opType !== "max";

        const variables = jsonModel.variables;
        const constraints = jsonModel.constraints as Record<string, ConstraintDefinition | string>;

        const constraintsMin: Record<string, Constraint> = {};
        const constraintsMax: Record<string, Constraint> = {};

        // Instantiating constraints
        const constraintIds = Object.keys(constraints);
        const nConstraintIds = constraintIds.length;

        for (let c = 0; c < nConstraintIds; c += 1) {
            const constraintId = constraintIds[c];
            const constraint = constraints[constraintId] as ConstraintDefinition;
            const equal = (constraint as ConstraintBound).equal;

            const weight = (constraint as ConstraintBound).weight;
            const priority = (constraint as ConstraintBound).priority as Priority | undefined;
            const relaxed = weight !== undefined || priority !== undefined;

            let lowerBound: Constraint | undefined;
            let upperBound: Constraint | undefined;
            if (equal === undefined) {
                const min = (constraint as ConstraintBound).min;
                if (min !== undefined) {
                    lowerBound = this.greaterThan(min);
                    constraintsMin[constraintId] = lowerBound;
                    if (relaxed) {
                        lowerBound.relax(weight, priority);
                    }
                }

                const max = (constraint as ConstraintBound).max;
                if (max !== undefined) {
                    upperBound = this.smallerThan(max);
                    constraintsMax[constraintId] = upperBound;
                    if (relaxed) {
                        upperBound.relax(weight, priority);
                    }
                }
            } else {
                lowerBound = this.greaterThan(equal);
                constraintsMin[constraintId] = lowerBound;

                upperBound = this.smallerThan(equal);
                constraintsMax[constraintId] = upperBound;

                const equality = new Equality(lowerBound, upperBound);
                if (relaxed) {
                    equality.relax(weight, priority);
                }
            }
        }

        const variableIds = Object.keys(variables);
        const nVariables = variableIds.length;

        //
        //
        // *** OPTIONS ***
        //
        //

        this.tolerance = jsonModel.tolerance || 0;

        if (jsonModel.timeout) {
            this.timeout = jsonModel.timeout;
        }

        //
        //
        // The model is getting too sloppy with options added to it...
        // mebe it needs an "options" option...?
        //
        // YES! IT DOES!
        // DO IT!
        // NOW!
        // HERE!!!
        //
        if (jsonModel.options) {
            //
            // TIMEOUT
            //
            if (jsonModel.options.timeout) {
                this.timeout = jsonModel.options.timeout;
            }

            //
            // TOLERANCE
            //
            if (this.tolerance === 0) {
                this.tolerance = jsonModel.options.tolerance || 0;
            }

            //
            // MIR CUTS - (NOT WORKING)
            //
            if (jsonModel.options.useMIRCuts) {
                this.useMIRCuts = jsonModel.options.useMIRCuts;
            }

            //
            // CYCLE CHECK...tricky because it defaults to false
            //
            //
            // This should maybe be on by default...
            //
            if (typeof jsonModel.options.exitOnCycles === "undefined") {
                this.checkForCycles = true;
            } else {
                this.checkForCycles = jsonModel.options.exitOnCycles;
            }

            //
            // STORE MILP MODELS
            //
            if (jsonModel.options.keep_solutions) {
                this.keep_solutions = jsonModel.options.keep_solutions;
            } else {
                this.keep_solutions = false;
            }
        }

        //
        //
        // /// OPTIONS \\\
        //
        //

        const integerVarIds = jsonModel.ints || {};
        const binaryVarIds = jsonModel.binaries || {};
        const unrestrictedVarIds = jsonModel.unrestricted || {};

        // Instantiating variables and constraint terms
        const objectiveName = jsonModel.optimize as string;
        for (let v = 0; v < nVariables; v += 1) {
            // Creation of the variables
            const variableId = variableIds[v];
            const variableConstraints = variables[variableId] as Record<string, number>;
            const cost = variableConstraints[objectiveName] || 0;
            const isBinary = !!binaryVarIds[variableId];
            const isInteger = !!integerVarIds[variableId] || isBinary;
            const isUnrestricted = !!unrestrictedVarIds[variableId];
            const variable = this.addVariable(cost, variableId, isInteger, isUnrestricted);

            if (isBinary) {
                // Creating an upperbound constraint for this variable
                this.smallerThan(1).addTerm(1, variable);
            }

            const constraintNames = Object.keys(variableConstraints);
            for (let c = 0; c < constraintNames.length; c += 1) {
                const constraintName = constraintNames[c];
                if (constraintName === objectiveName) {
                    continue;
                }

                const coefficient = variableConstraints[constraintName];

                const constraintMin = constraintsMin[constraintName];
                if (constraintMin !== undefined) {
                    constraintMin.addTerm(coefficient, variable);
                }

                const constraintMax = constraintsMax[constraintName];
                if (constraintMax !== undefined) {
                    constraintMax.addTerm(coefficient, variable);
                }
            }
        }

        return this;
    }

    //-------------------------------------------------------------------
    //-------------------------------------------------------------------
    getNumberOfIntegerVariables(): number {
        return this.integerVariables.length;
    }

    solve(): TableauSolution {
        // Setting tableau if not done
        if (this.tableauInitialized === false) {
            this.tableau.setModel(this);
            this.tableauInitialized = true;
        }

        return this.tableau.solve();
    }

    isFeasible(): boolean {
        return this.tableau.feasible;
    }

    save(): void {
        this.tableau.save();
    }

    restore(): void {
        this.tableau.restore();
    }

    activateMIRCuts(useMIRCuts: boolean): void {
        this.useMIRCuts = useMIRCuts;
    }

    debug(debugCheckForCycles: boolean): void {
        this.checkForCycles = debugCheckForCycles;
    }

    log(message: unknown): Tableau {
        return this.tableau.log(message);
    }
}

export default Model;
