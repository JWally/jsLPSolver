var Constraint = require('./Constraint.js');
var primitives = require('./primitives.js');
var Variable = primitives.Variable;
var Numeral = primitives.Numeral;
var Term = primitives.Term;


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

    this.nConstraints = 0;
    this.nVariables = 0;

    this.optimizationType = 'min'; // or 'max'
}
module.exports = Model;

Model.prototype.addConstraint = function (constraint) {
    this.constraints.push(constraint);
    this.nConstraints += 1;
    return this;
};

Model.prototype.createVariable = function (name, objectiveCoefficient, isInteger) {
    var varIndex = this.variables.length;
    var variable = new Variable(name, varIndex);
    this.variables.push(variable);

    if (isInteger) {
        this.integerVarIndexes.push(varIndex);
    }

    this.objectiveCosts[varIndex] = objectiveCoefficient;
    this.nVariables += 1;

    return variable;
};

Model.prototype.setObjectiveCoefficient = function (variable, objectiveCoefficient) {
    this.objectiveCosts[variable.index] = objectiveCoefficient;
    return this;
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Model.prototype.loadJson = function (jsonModel) {
    this.optimizationType = jsonModel.opType;

    var variables = jsonModel.variables;
    var constraints = jsonModel.constraints;

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
            constraintsMinIndexes[constraintId] = this.constraints.length;
            this.constraints.push(new Constraint('min', equal));

            constraintsMaxIndexes[constraintId] = this.constraints.length;
            this.constraints.push(new Constraint('max', equal));
        }

        var min = constraint.min;
        if (min !== undefined) {
            constraintsMinIndexes[constraintId] = this.constraints.length;
            this.constraints.push(new Constraint('min', min));
        }

        var max = constraint.max;
        if (max !== undefined) {
            constraintsMaxIndexes[constraintId] = this.constraints.length;
            this.constraints.push(new Constraint('max', max));
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
        var variableId = this.variableIds[v];
        var variable = new Variable(variableId, v);
        this.variables[v] = variable;

        this.objectiveCosts[v] = new Numeral(0);

        var variableConstraints = variables[variableId];
        var constraintNames = Object.keys(variableConstraints);
        for (c = 0; c < constraintNames.length; c += 1) {
            var constraintName = constraintNames[c];

            var coefficient = variableConstraints[constraintName];
            if (constraintName === objectiveName) {
                this.objectiveCosts[v] = new Numeral(coefficient);
            } else {
                var term = new Term(coefficient, variable);

                var constraintMinIndex = constraintsMinIndexes[constraintName];
                if (constraintMinIndex !== undefined) {
                    this.constraints[constraintMinIndex].addTerm(term);
                }

                var constraintMaxIndex = constraintsMaxIndexes[constraintName];
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
            variableId = this.variableIds[v];
            if (integerVarIds[variableId] !== undefined) {
                this.integerVarIndexes.push(v);
            }
        }
    }

    this.nConstraints = this.constraints.length;
    this.nVariable = this.variables.length;

    return this;
};
