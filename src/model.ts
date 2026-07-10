/**
 * @file src/model.ts
 * @description Model class for LP/MIP problem representation
 *
 * Provides the programmatic API for building optimization problems:
 * - Add variables with costs and integer constraints
 * - Define constraints (<=, >=, =) with coefficients
 * - Load problems from JSON model definitions
 * - Dynamic model modification after initialization
 *
 * The Model converts high-level problem definitions into the internal
 * Tableau representation used by the simplex algorithm.
 */
import Tableau from "./tableau/tableau";
import { Constraint, Equality, IntegerVariable, Variable } from "./expressions";
import type { Priority } from "./expressions";
import type { BranchAndCutService } from "./tableau/branch-and-cut";
import type { ConstraintBound, Model as JsonModel } from "./types/solver";
import type { TableauSolution, TableauSolutionSet } from "./tableau";
import { presolve, type PresolveResult } from "./tableau/presolve";

type ConstraintDefinition = ConstraintBound | (ConstraintBound & { equal?: number });

/**
 * High-level representation of an optimization problem.
 *
 * Provides a programmatic API for building LP/MIP problems:
 * - Add variables with costs, integer constraints, and priorities
 * - Define constraints (<=, >=, =) with coefficients
 * - Load problems from JSON model definitions
 * - Dynamically modify models after initialization
 *
 * The Model converts high-level definitions into the internal Tableau
 * representation used by the simplex algorithm.
 *
 * @example
 * ```ts
 * const model = new Model();
 * const x = model.addVariable(3, "x");
 * const y = model.addVariable(5, "y");
 * model.smallerThan(10).addTerm(1, x).addTerm(2, y);
 * const solution = model.solve();
 * ```
 */
class Model {
    /** The underlying simplex tableau. */
    tableau: Tableau;
    /** Optional model name for identification. */
    name?: string;
    /** All decision variables in insertion order. */
    variables: Variable[];
    /** Subset of variables with integrality constraints. */
    integerVariables: IntegerVariable[];
    /** Set of variable indices that may take negative values. */
    unrestrictedVariables: Record<number, boolean>;
    /** All constraints in insertion order. */
    constraints: Constraint[];
    /** Current number of constraints. */
    nConstraints: number;
    /** Current number of variables. */
    nVariables: number;
    /** True for minimization, false for maximization. */
    isMinimization: boolean;
    /** Whether the tableau has been initialized from this model. */
    tableauInitialized: boolean;
    /** Counter for generating unique relaxation variable IDs. */
    relaxationIndex: number;
    /** Whether MIR cuts are enabled for branch-and-cut. */
    useMIRCuts: boolean;
    /** Whether to detect and abort on simplex pivot cycles. */
    checkForCycles: boolean;
    /** Diagnostic messages collected during solving. */
    messages: unknown[];
    /** Optimality tolerance for early termination in B&C. */
    tolerance?: number;
    /** Maximum solve time in milliseconds. */
    timeout?: number;
    /** Whether to store all integer-feasible solutions found during B&C. */
    keep_solutions?: boolean;
    /** All integer-feasible solutions found (if keep_solutions is true). */
    solutions?: TableauSolutionSet[];
    /** Pool of recycled variable/constraint indices. */
    availableIndexes: number[];
    /** Next fresh index to allocate. */
    lastElementIndex: number;
    /** Whether to apply preprocessing reductions before solving. */
    usePresolve: boolean;
    /** Cached presolve results (null if not yet applied). */
    presolveResult: PresolveResult | null;

    /**
     * @param precision - Numerical tolerance for the tableau (default: 1e-8).
     * @param name - Optional model name.
     * @param branchAndCutService - Custom B&C strategy for MIP solving.
     */
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

        this.checkForCycles = false;

        // Collect diagnostic messages for debugging without console output
        this.messages = [];

        this.availableIndexes = [];
        this.lastElementIndex = 0;
        this.usePresolve = true;
        this.presolveResult = null;
    }

    /** Set the optimization direction to minimization. */
    minimize(): this {
        this.isMinimization = true;
        return this;
    }

    /** Set the optimization direction to maximization. */
    maximize(): this {
        this.isMinimization = false;
        return this;
    }

    /** Allocate a new element index, reusing from pool if available. */
    _getNewElementIndex(): number {
        if (this.availableIndexes.length > 0) {
            return this.availableIndexes.pop() as number;
        }

        const index = this.lastElementIndex;
        this.lastElementIndex += 1;
        return index;
    }

    /** Register a constraint with the model and propagate to tableau if initialized. */
    _addConstraint(constraint: Constraint): void {
        const slackVariable = constraint.slack;
        this.tableau.variablesPerIndex[slackVariable.index] = slackVariable;
        this.constraints.push(constraint);
        this.nConstraints += 1;
        if (this.tableauInitialized === true) {
            this.tableau.addConstraint(constraint);
        }
    }

    /**
     * Create a <= (upper bound) constraint.
     * @param rhs - The upper bound value.
     * @returns The new constraint (add terms via .addTerm()).
     */
    smallerThan(rhs: number): Constraint {
        const constraint = new Constraint(rhs, true, this.tableau.getNewElementIndex(), this);
        this._addConstraint(constraint);
        return constraint;
    }

    /**
     * Create a >= (lower bound) constraint.
     * @param rhs - The lower bound value.
     * @returns The new constraint (add terms via .addTerm()).
     */
    greaterThan(rhs: number): Constraint {
        const constraint = new Constraint(rhs, false, this.tableau.getNewElementIndex(), this);
        this._addConstraint(constraint);
        return constraint;
    }

    /**
     * Create an equality constraint (implemented as paired upper + lower bounds).
     * @param rhs - The equality value.
     * @returns An Equality wrapping both bounds (add terms via .addTerm()).
     */
    equal(rhs: number): Equality {
        const constraintUpper = new Constraint(rhs, true, this.tableau.getNewElementIndex(), this);
        this._addConstraint(constraintUpper);

        const constraintLower = new Constraint(rhs, false, this.tableau.getNewElementIndex(), this);
        this._addConstraint(constraintLower);

        return new Equality(constraintUpper, constraintLower);
    }

    /**
     * Add a decision variable to the model.
     *
     * @param cost - Objective function coefficient (default: 0).
     * @param id - Unique identifier (default: auto-generated).
     * @param isInteger - If true, the variable is restricted to integer values.
     * @param isUnrestricted - If true, the variable may be negative.
     * @param priority - Priority level for hierarchical optimization.
     * @returns The newly created Variable instance.
     */
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

    /** Remove a single constraint from the model and propagate to tableau. */
    _removeConstraint(constraint: Constraint): void {
        const idx = this.constraints.indexOf(constraint);
        if (idx === -1) {
            // eslint-disable-next-line no-console
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

    /**
     * Remove a constraint or equality from the model.
     * For equalities, removes both the upper and lower bound constraints.
     *
     * @param constraint - The Constraint or Equality to remove.
     * @returns This model for chaining.
     */
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

    /**
     * Remove a variable from the model.
     * @param variable - The variable to remove.
     * @returns This model for chaining, or void if variable not found.
     */
    removeVariable(variable: Variable): this | void {
        const idx = this.variables.indexOf(variable);
        if (idx === -1) {
            // eslint-disable-next-line no-console
            console.warn("[Model.removeVariable] Variable not present in model");
            return;
        }
        this.variables.splice(idx, 1);

        if (this.tableauInitialized === true) {
            this.tableau.removeVariable(variable);
        }

        return this;
    }

    /**
     * Update a constraint's RHS in the live tableau.
     * @param constraint - The constraint to update.
     * @param difference - Amount to subtract from the current RHS.
     */
    updateRightHandSide(constraint: Constraint, difference: number): this {
        if (this.tableauInitialized === true) {
            this.tableau.updateRightHandSide(constraint, difference);
        }
        return this;
    }

    /**
     * Update a variable's coefficient in a constraint in the live tableau.
     * @param constraint - The constraint being modified.
     * @param variable - The variable whose coefficient is changing.
     * @param difference - Amount to add to the current coefficient.
     */
    updateConstraintCoefficient(
        constraint: Constraint,
        variable: Variable,
        difference: number
    ): this {
        if (this.tableauInitialized === true) {
            this.tableau.updateConstraintCoefficient(constraint, variable, difference);
        }
        return this;
    }

    /**
     * Change a variable's objective coefficient.
     * @param cost - New objective coefficient value.
     * @param variable - The variable to update.
     */
    setCost(cost: number, variable: Variable): this {
        let difference = cost - variable.cost;
        if (this.isMinimization === false) {
            difference = -difference;
        }

        variable.cost = cost;
        this.tableau.updateCost(variable, difference);
        return this;
    }

    /**
     * Load a problem from the JSON model definition format.
     *
     * Parses constraints, variables, integer/binary flags, and solver options
     * from the JSON structure. Supports equality constraints (via paired bounds),
     * soft constraints (weight/priority), and binary variable upper bounds.
     *
     * @param jsonModel - The JSON model definition.
     * @returns This model for chaining.
     */
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

        // Parse solver options
        this.tolerance = jsonModel.tolerance || 0;

        if (jsonModel.timeout) {
            this.timeout = jsonModel.timeout;
        }

        // Options object takes precedence over top-level properties
        if (jsonModel.options) {
            if (jsonModel.options.timeout) {
                this.timeout = jsonModel.options.timeout;
            }

            if (this.tolerance === 0) {
                this.tolerance = jsonModel.options.tolerance || 0;
            }

            if (jsonModel.options.useMIRCuts) {
                this.useMIRCuts = jsonModel.options.useMIRCuts;
            }

            if (typeof jsonModel.options.exitOnCycles !== "undefined") {
                this.checkForCycles = jsonModel.options.exitOnCycles;
            }

            if (jsonModel.options.keep_solutions) {
                this.keep_solutions = jsonModel.options.keep_solutions;
            } else {
                this.keep_solutions = false;
            }

            if (jsonModel.options.presolve !== undefined) {
                this.usePresolve = jsonModel.options.presolve;
            }
        }

        const integerVarIds = jsonModel.ints || {};
        const binaryVarIds = jsonModel.binaries || {};
        const unrestrictedVarIds = jsonModel.unrestricted || {};

        // Instantiating variables and constraint terms
        const objectiveName = jsonModel.optimize as string;

        // Check if objectiveName exists as a coefficient key in any variable.
        // If not, and it matches a variable name, the user wants to optimize
        // that variable directly (implicit cost of 1).
        const objectiveIsAttribute = variableIds.some(
            (id) => objectiveName in (variables[id] as Record<string, number>)
        );
        const objectiveIsVariable = !objectiveIsAttribute && variableIds.includes(objectiveName);

        for (let v = 0; v < nVariables; v += 1) {
            // Creation of the variables
            const variableId = variableIds[v];
            const variableConstraints = variables[variableId] as Record<string, number>;
            const cost = objectiveIsVariable
                ? variableId === objectiveName
                    ? 1
                    : 0
                : variableConstraints[objectiveName] || 0;
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

    /** @returns The number of integer-constrained variables in this model. */
    getNumberOfIntegerVariables(): number {
        return this.integerVariables.length;
    }

    /**
     * Solve the optimization problem.
     *
     * Applies presolve reductions (if enabled), initializes the tableau,
     * and runs simplex (for LP) or branch-and-cut (for MIP).
     *
     * @returns The solution with objective value and variable assignments.
     */
    solve(): TableauSolution {
        // Apply presolve to reduce problem size
        if (this.usePresolve && this.presolveResult === null) {
            this.presolveResult = presolve(this);

            if (this.presolveResult.isInfeasible) {
                // Problem is infeasible - return early
                this.tableau.feasible = false;
                return this.tableau.getSolution();
            }

            // Apply fixed variables to constraints
            this.applyPresolveReductions(this.presolveResult);
        }

        // Setting tableau if not done
        if (this.tableauInitialized === false) {
            this.tableau.setModel(this);
            this.tableauInitialized = true;
        }

        return this.tableau.solve();
    }

    /**
     * Apply presolve reductions to the model.
     * Sets fixed variable values and removes redundant constraints.
     */
    private applyPresolveReductions(result: PresolveResult): void {
        // Set fixed variable values
        for (const [variable, value] of result.fixedVariables) {
            variable.value = value;
            // Zero out the cost since variable is fixed
            variable.cost = 0;
        }

        // Note: We don't actually remove constraints/variables from the model
        // as that would require complex bookkeeping. Instead, the presolve
        // information is used to detect early infeasibility and fix variable values.
        // A more aggressive presolve would rebuild the model without fixed variables.
    }

    /** @returns Whether the last solve found a feasible solution. */
    isFeasible(): boolean {
        return this.tableau.feasible;
    }

    /** Snapshot the current tableau state for later restoration. */
    save(): void {
        this.tableau.save();
    }

    /** Restore the tableau to the previously saved state. */
    restore(): void {
        this.tableau.restore();
    }

    /**
     * Enable or disable Mixed Integer Rounding cuts.
     * @param useMIRCuts - Whether to apply MIR cuts during branch-and-cut.
     */
    activateMIRCuts(useMIRCuts: boolean): void {
        this.useMIRCuts = useMIRCuts;
    }

    /**
     * Enable or disable cycle detection in the simplex algorithm.
     * @param debugCheckForCycles - Whether to check for pivot cycles.
     */
    debug(debugCheckForCycles: boolean): void {
        this.checkForCycles = debugCheckForCycles;
    }

    /** Print the tableau to console for debugging. */
    log(message: unknown): Tableau {
        return this.tableau.log(message);
    }
}

export default Model;
