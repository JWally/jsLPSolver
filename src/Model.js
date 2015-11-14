/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/

var Tableau = require("./Tableau.js");
var MILP = require("./MILP.js");
var expressions = require("./expressions.js");
var Constraint = expressions.Constraint;
var Equality = expressions.Equality;
var Variable = expressions.Variable;

var Term = expressions.Term;

/*************************************************************
 * Class: Model
 * Description: Holds the model of a linear optimisation problem
 **************************************************************/
function Model(precision, name) {
    this.tableau = new Tableau(precision);

    this.name = name;

    this.variables = [];

    this.variableIds = [];

    this.integerVariables = [];

    this.unrestrictedVariables = {};

    this.constraints = [];

    this.nConstraints = 0;

    this.nVariables = 0;

    this.isMinimization = true;

    this.availableIndexes = [];
    this.lastElementIndex = 0;

    this.tableauInitialized = false;
}
module.exports = Model;

Model.prototype.minimize = function () {
    this.isMinimization = true;
    return this;
};

Model.prototype.maximize = function () {
    this.isMinimization = false;
    return this;
};

// Model.prototype.addConstraint = function (constraint) {
//     // TODO: make sure that the constraint does not belong do another model
//     // and make 
//     this.constraints.push(constraint);
//     return this;
// };

Model.prototype._getNewElementIndex = function () {
    if (this.availableIndexes.length > 0) {
        return this.availableIndexes.pop();
    }

    var index = this.lastElementIndex;
    this.lastElementIndex += 1;
    return index;
};

Model.prototype._addConstraint = function (constraint) {
    this.constraints.push(constraint);
    this.nConstraints += 1;
    if (this.tableauInitialized === true) {
        this.tableau.addConstraint(constraint);
    }
};

Model.prototype.smallerThan = function (rhs) {
    var constraint = new Constraint(rhs, true, this._getNewElementIndex(), this);
    this._addConstraint(constraint);
    return constraint;
};

Model.prototype.greaterThan = function (rhs) {
    var constraint = new Constraint(rhs, false, this._getNewElementIndex(), this);
    this._addConstraint(constraint);
    return constraint;
};

Model.prototype.equal = function (rhs) {
    var constraintUpper = new Constraint(rhs, true, this._getNewElementIndex(), this);
    this._addConstraint(constraintUpper);

    var constraintLower = new Constraint(rhs, false, this._getNewElementIndex(), this);
    this._addConstraint(constraintLower);

    return new Equality(constraintUpper, constraintLower);
};

Model.prototype.addVariable = function (cost, id, isInteger, isUnrestricted, priority) {
    if (typeof priority === 'string') {
        switch (priority) {
        case 'required': priority = 0; break;
        case 'strong': priority = 1; break;
        case 'medium': priority = 2; break;
        case 'weak': priority = 3; break;
        default: priority = 0; break;
        }
    }

    var varIndex = this._getNewElementIndex();
    if (!id) { // could be null, undefined or empty string
        id = 'x' + varIndex;
    }

    if (!cost) { // could be null, undefined or already 0
        cost = 0;
    }

    if (!priority) { // could be null, undefined or already 0
        priority = 0;
    }

    var variable = new Variable(id, cost, varIndex, priority);
    this.variables.push(variable);
    this.variableIds[varIndex] = id;

    if (isInteger) {
        this.integerVariables.push(variable);
    }

    if (isUnrestricted) {
        this.unrestrictedVariables[varIndex] = true;
    }

    this.nVariables += 1;

    if (this.tableauInitialized === true) {
        this.tableau.addVariable(variable);
    }

    return variable;
};

//-------------------------------------------------------------------
// For dynamic model modification
//-------------------------------------------------------------------
Model.prototype.removeConstraint = function (constraint) {
    var idx = this.constraints.indexOf(constraint);
    if (idx === -1) {
        console.warn("[Model.removeConstraint] Constraint not present in model");
        return;
    }

    if (this.tableauInitialized === true) {
        if (constraint instanceof Equality === true) {
            this.tableau.removeConstraint(constraint.upperBound);
            this.tableau.removeConstraint(constraint.lowerBound);
        } else {
            this.tableau.removeConstraint(constraint);
        }
    }

    this.constraints.splice(idx, 1);
    this.nConstraints -= 1;
    this.availableIndexes.push(constraint.index);
    if (constraint.relaxation) {
        this.removeVariable(constraint.relaxation);
    }
    return this;
};

Model.prototype.removeVariable = function (variable) {
    // TODO ? remove variable term from every constraint?
    // How: every variable should reference the constraints it appears in
    var idx = this.variables.indexOf(variable);
    if (idx === -1) {
        console.warn("[Model.removeVariable] Variable not present in model");
        return;
    }

    if (this.tableauInitialized === true) {
        this.tableau.removeVariable(variable);
    }

    this.availableIndexes.push(variable.index);

    variable.index = -1;
    this.variables.splice(idx, 1);
    return this;
};

Model.prototype.updateRightHandSide = function (constraint, difference) {
    if (this.tableauInitialized === true) {
        this.tableau.updateRightHandSide(constraint, difference);
    }
    return this;
};

Model.prototype.updateConstraintCoefficient = function (constraint, variable, difference) {
    if (this.tableauInitialized === true) {
        this.tableau.updateConstraintCoefficient(constraint, variable, difference);
    }
    return this;
};


Model.prototype.setCost = function (cost, variable) {
    var difference = cost - variable.cost;
    if (this.isMinimization === false) {
        difference = -difference;
    }

    variable.cost = cost;
    this.tableau.updateCost(variable, difference);
    return this;
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Model.prototype.loadJson = function (jsonModel) {
    this.isMinimization = (jsonModel.opType !== "max");

    var variables = jsonModel.variables;
    var constraints = jsonModel.constraints;

    var constraintsMin = {};
    var constraintsMax = {};

    // Instantiating constraints
    var constraintIds = Object.keys(constraints);
    var nConstraintIds = constraintIds.length;

    for (var c = 0; c < nConstraintIds; c += 1) {
        var constraintId = constraintIds[c];
        var constraint = constraints[constraintId];
        var equal = constraint.equal;

        var min = (equal === undefined) ? constraint.min : equal;
        if (min !== undefined) {
            constraintsMin[constraintId] = this.greaterThan(min);
        }

        var max = (equal === undefined) ? constraint.max : equal;
        if (max !== undefined) {
            constraintsMax[constraintId] = this.smallerThan(max);
        }

        if (equal !== undefined) {
            var equality = new Equality(constraintsMin[constraintId], constraintsMax[constraintId]);
            if (constraint.weight !== undefined) {
                equality.relax(constraint.weight);
            }
            continue;
        }
    }

    var variableIds = Object.keys(variables);
    var nVariables = variableIds.length;

    var integerVarIds = jsonModel.ints || {};
    var unrestrictedVarIds = jsonModel.unrestricted || {};

    // Instantiating variables and constraint terms
    var objectiveName = jsonModel.optimize;
    for (var v = 0; v < nVariables; v += 1) {
        // Creation of the variables
        var variableId = variableIds[v];
        var variableConstraints = variables[variableId];
        var cost = variableConstraints[objectiveName] || 0;
        var isInteger = !!integerVarIds[variableId];
        var isUnrestricted = !!unrestrictedVarIds[variableId];
        var variable = this.addVariable(cost, variableId, isInteger, isUnrestricted);

        var constraintNames = Object.keys(variableConstraints);
        for (c = 0; c < constraintNames.length; c += 1) {
            var constraintName = constraintNames[c];
            if (constraintName === objectiveName) {
                continue;
            }

            var coefficient = variableConstraints[constraintName];

            var constraintMin = constraintsMin[constraintName];
            if (constraintMin !== undefined) {
                constraintMin.addTerm(coefficient, variable);
            }

            var constraintMax = constraintsMax[constraintName];
            if (constraintMax !== undefined) {
                constraintMax.addTerm(coefficient, variable);
            }
        }
    }

    return this;
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Model.prototype.getNumberOfIntegerVariables = function () {
    return this.integerVariables.length;
};

Model.prototype.solve = function () {
    // Setting tableau if not done
    if (this.tableauInitialized === false) {
        this.tableau.setModel(this);
        this.tableauInitialized = true;
    }

    if (this.getNumberOfIntegerVariables() > 0) {
        return MILP(this);
    } else {
        var solution = this.tableau.solve().getSolution();
        this.tableau.updateVariableValues();
        return solution;
    }
};

Model.prototype.compileSolution = function () {
    return this.tableau.compileSolution();
};

Model.prototype.isFeasible = function () {
    return this.tableau.feasible;
};

Model.prototype.save = function () {
    return this.tableau.save();
};

Model.prototype.restore = function () {
    return this.tableau.restore();
};

Model.prototype.log = function (message) {
    return this.tableau.log(message);
};
