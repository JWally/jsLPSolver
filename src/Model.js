/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/

var expressions = require("./expressions.js");
var Constraint = expressions.Constraint;
var Variable = expressions.Variable;
var Numeral = expressions.Numeral;
var Term = expressions.Term;


/*************************************************************
 * Class: Model
 * Description: Holds a linear optimisation problem model
 **************************************************************/
function Model() {
    this.variables = [];

    this.variableIds = [];

    this.integerVarIndexes = [];

    this.constraints = [];

    this.objectiveCosts = [];

    this.nInequalities = 0;
    this.nEqualities = 0;
    this.nVariables = 0;

    this.minimize = true;
}
module.exports = Model;

Model.prototype.minimize = function () {
    this.minimize = true;
    return this;
};

Model.prototype.maximize = function () {
    this.minimize = false;
    return this;
};

// Model.prototype.addConstraint = function (constraint) {
//     // TODO: make sure that the constraint does not belong do another model
//     // and make 
//     this.constraints.push(constraint);
//     return this;
// };

Model.prototype.smallerThan = function (rhs) {
    var constraint = new Constraint(rhs, true, false);
    this.constraints.push(constraint);
    this.nInequalities += 1;
    return constraint;
};

Model.prototype.greaterThan = function (rhs) {
    var constraint = new Constraint(rhs, false, true);
    this.constraints.push(constraint);
    this.nInequalities += 1;
    return constraint;
};

Model.prototype.equal = function (rhs) {
    var constraint = new Constraint(rhs, true, true);
    this.constraints.push(constraint);
    this.nEqualities += 1;
    return constraint;
};

Model.prototype.createVariable = function (name, objectiveCoefficient,
    isInteger) {
    var varIndex = this.variables.length;
    var variable = new Variable(name, varIndex);
    this.variables.push(variable);

    if (isInteger) {
        this.integerVarIndexes.push(varIndex);
    }

    this.objectiveCosts[varIndex] = Numeral(objectiveCoefficient);
    this.nVariables += 1;

    return variable;
};

Model.prototype.setObjectiveCoefficient = function (variable,
    objectiveCoefficient) {
    this.objectiveCosts[variable.index] = Numeral(objectiveCoefficient);
    return this;
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Model.prototype.loadJson = function (jsonModel) {
    var variableId;

    this.minimize = (jsonModel.opType === "min");

    var variables = jsonModel.variables;
    var constraints = jsonModel.constraints;

    var constraintsEqualIndexes = {};
    var constraintsMinIndexes = {};
    var constraintsMaxIndexes = {};

    // Instantiating constraints
    var constraintIds = Object.keys(constraints);
    var nConstraints = constraintIds.length;
    for (var c = 0; c < nConstraints; c += 1) {
        var constraintId = constraintIds[c];
        var constraint = constraints[constraintId];

        var equal = constraint.equal;
        if (equal !== undefined) {
            constraintsEqualIndexes[constraintId] = this.constraints.length;
            this.constraints.push(new Constraint(equal, true, true));
            this.nEqualities += 1;
        }

        var min = constraint.min;
        if (min !== undefined) {
            constraintsMinIndexes[constraintId] = this.constraints.length;
            this.constraints.push(new Constraint(min, false, true));
            this.nInequalities += 1;
        }

        var max = constraint.max;
        if (max !== undefined) {
            constraintsMaxIndexes[constraintId] = this.constraints.length;
            this.constraints.push(new Constraint(max, true, false));
            this.nInequalities += 1;
        }
    }


    this.variableIds = Object.keys(variables);
    this.nVariables = this.variableIds.length;
    this.variables = [];

    // Instantiating variables and constraint terms
    var objectiveName = jsonModel.optimize;
    for (var v = 0; v < this.nVariables; v += 1) {
        var column = v + 1;

        // Creation of the variables
        variableId = this.variableIds[v];
        var variable = new Variable(variableId, v);
        this.variables[v] = variable;

        this.objectiveCosts[v] = new Numeral(0);

        var variableConstraints = variables[variableId];
        var constraintNames = Object.keys(variableConstraints);
        for (c = 0; c < constraintNames.length; c += 1) {
            var constraintName = constraintNames[c];

            var coefficient = Numeral(variableConstraints[constraintName]);
            if (constraintName === objectiveName) {
                this.objectiveCosts[v] = coefficient;
            } else {
                var term = new Term(coefficient, variable);

                var constraintEqualIndex = constraintsEqualIndexes[
                    constraintName];
                if (constraintEqualIndex !== undefined) {
                    this.constraints[constraintEqualIndex].addTerm(term);
                }

                var constraintMinIndex = constraintsMinIndexes[
                    constraintName];
                if (constraintMinIndex !== undefined) {
                    this.constraints[constraintMinIndex].addTerm(term);
                }

                var constraintMaxIndex = constraintsMaxIndexes[
                    constraintName];
                if (constraintMaxIndex !== undefined) {
                    this.constraints[constraintMaxIndex].addTerm(term);
                }
            }
        }
    }

    // Adding integer variable references
    var integerVarIds = jsonModel.ints;
    if (integerVarIds !== undefined) {
        for (v = 0; v < this.nVariables; v += 1) {
            if (integerVarIds[this.variableIds[v]] !== undefined) {
                this.integerVarIndexes.push(v);
            }
        }
    }

    this.nVariable = this.variables.length;
    return this;
};
