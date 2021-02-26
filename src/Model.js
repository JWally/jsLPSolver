
import Tableau from "./Tableau/index.js";
// var branchAndCut = require("./Tableau/branchAndCut.js");
import { Constraint, Equality, Variable, IntegerVariable } from "./Expressions.js";

/*************************************************************
 * Class: Model
 * Description: Holds the model of a linear optimisation problem
 **************************************************************/
export default class Model {
    constructor(precision, name) {
        this.tableau = new Tableau(precision);

        this.name = name;

        this.variables = [];

        this.integerVariables = [];

        this.unrestrictedVariables = {};

        this.constraints = [];

        // this.nConstraints = 0;

        // this.nVariables = 0;

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
    }

    minimize() {
        this.isMinimization = true;
        return this;
    }

    maximize() {
        this.isMinimization = false;
        return this;
    }

    // addConstraint (constraint) {
    //     // TODO: make sure that the constraint does not belong do another model
    //     // and make
    //     this.constraints.push(constraint);
    //     return this;
    // }

    _getNewElementIndex() {
        if (this.availableIndexes.length > 0) {
            return this.availableIndexes.pop();
        }

        const index = this.lastElementIndex;
        this.lastElementIndex += 1;
        return index;
    }

    _addConstraint(constraint) {
        const slackVariable = constraint.slack;
        this.tableau.variablesPerIndex[slackVariable.index] = slackVariable;
        this.constraints.push(constraint);
        // this.nConstraints += 1;
        if (this.tableauInitialized === true) {
            this.tableau.addConstraint(constraint);
        }
    }

    smallerThan(rhs) {
        const constraint = new Constraint(rhs, true, this.tableau.getNewElementIndex(), this);
        this._addConstraint(constraint);
        return constraint;
    }

    greaterThan(rhs) {
        const constraint = new Constraint(rhs, false, this.tableau.getNewElementIndex(), this);
        this._addConstraint(constraint);
        return constraint;
    }

    equal(rhs) {
        const constraintUpper = new Constraint(rhs, true, this.tableau.getNewElementIndex(), this);
        this._addConstraint(constraintUpper);

        const constraintLower = new Constraint(rhs, false, this.tableau.getNewElementIndex(), this);
        this._addConstraint(constraintLower);

        return new Equality(constraintUpper, constraintLower);
    }

    addVariable(cost, id, isInteger, isUnrestricted, priority) {
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
        if (id === null || id === undefined) {
            id = "v" + varIndex;
        }

        if (cost === null || cost === undefined) {
            cost = 0;
        }

        if (priority === null || priority === undefined) {
            priority = 0;
        }

        let variable = undefined;
        if (isInteger) {
            variable = new IntegerVariable(id, cost, varIndex, priority);
            this.integerVariables.push(variable);
        } else {
            variable = new Variable(id, cost, varIndex, priority);
        }

        this.variables.push(variable);
        this.tableau.variablesPerIndex[varIndex] = variable;

        if (isUnrestricted) {
            this.unrestrictedVariables[varIndex] = true;
        }

        // this.nVariables += 1;

        if (this.tableauInitialized === true) {
            this.tableau.addVariable(variable);
        }

        return variable;
    }

    _removeConstraint(constraint) {
        const idx = this.constraints.indexOf(constraint);
        if (idx === -1) {
            console.warn("[Model.removeConstraint] Constraint not present in model");
            return;
        }

        this.constraints.splice(idx, 1);
        // this.nConstraints -= 1;

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
    removeConstraint(constraint) {
        // if (constraint.isEquality) {
        if (constraint instanceof Equality) {
            this._removeConstraint(constraint.upperBound);
            this._removeConstraint(constraint.lowerBound);
        } else {
            this._removeConstraint(constraint);
        }

        return this;
    }

    removeVariable(variable) {
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

    updateRightHandSide(constraint, difference) {
        if (this.tableauInitialized === true) {
            this.tableau.updateRightHandSide(constraint, difference);
        }
        return this;
    }

    updateConstraintCoefficient(constraint, variable, difference) {
        if (this.tableauInitialized === true) {
            this.tableau.updateConstraintCoefficient(constraint, variable, difference);
        }
        return this;
    }


    setCost(cost, variable) {
        var difference = cost - variable.cost;
        if (this.isMinimization === false) {
            difference = -difference;
        }

        variable.cost = cost;
        this.tableau.updateCost(variable, difference);
        return this;
    }

    //-------------------------------------------------------------------
    //-------------------------------------------------------------------
    loadJson(jsonModel) {
        this.isMinimization = (jsonModel.opType !== "max");

        const variables = jsonModel.variables;
        const constraints = jsonModel.constraints;

        const constraintsMin = {};
        const constraintsMax = {};

        // Instantiating constraints
        const constraintIds = Object.keys(constraints);
        // var nConstraintIds = constraintIds.length;

        for (let c = 0; c < constraintIds.length; c++) {
            const constraintId = constraintIds[c];
            const constraint = constraints[constraintId];
            const equal = constraint.equal;

            const weight = constraint.weight;
            const priority = constraint.priority;
            const relaxed = weight !== undefined || priority !== undefined;

            let lowerBound, upperBound;
            if (equal === undefined) {
                const min = constraint.min;
                if (min !== undefined) {
                    lowerBound = this.greaterThan(min);
                    constraintsMin[constraintId] = lowerBound;
                    if (relaxed) { lowerBound.relax(weight, priority); }
                }

                const max = constraint.max;
                if (max !== undefined) {
                    upperBound = this.smallerThan(max);
                    constraintsMax[constraintId] = upperBound;
                    if (relaxed) { upperBound.relax(weight, priority); }
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
        // var nVariables = variableIds.length;



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

        var integerVarIds = jsonModel.ints || {};
        var binaryVarIds = jsonModel.binaries || {};
        var unrestrictedVarIds = jsonModel.unrestricted || {};

        // Instantiating variables and constraint terms
        var objectiveName = jsonModel.optimize;
        // for (var v = 0; v < nVariables; v += 1) {
        for (let v = 0; v < variableIds.length; v++) {
            // Creation of the variables
            const variableId = variableIds[v];
            const variableConstraints = variables[variableId];
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
    getNumberOfIntegerVariables() {
        return this.integerVariables.length;
    }

    solve() {
        // Setting tableau if not done
        if (this.tableauInitialized === false) {
            this.tableau.setModel(this);
            this.tableauInitialized = true;
        }

        return this.tableau.solve();
    }

    isFeasible() {
        return this.tableau.feasible;
    }

    save() {
        return this.tableau.save();
    }

    restore() {
        return this.tableau.restore();
    }

    activateMIRCuts(useMIRCuts) {
        this.useMIRCuts = useMIRCuts;
    }

    debug(debugCheckForCycles) {
        this.checkForCycles = debugCheckForCycles;
    }

    log(message) {
        return this.tableau.log(message);
    }

}
