(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/

//-------------------------------------------------------------------
//-------------------------------------------------------------------
function Cut(type, varIndex, value) {
    this.type = type;
    this.varIndex = varIndex;
    this.value = value;
}

//-------------------------------------------------------------------
//-------------------------------------------------------------------
function Branch(relaxedEvaluation, cuts) {
    this.relaxedEvaluation = relaxedEvaluation;
    this.cuts = cuts;
}

//-------------------------------------------------------------------
// Branch sorting strategies
//-------------------------------------------------------------------
function sortByEvaluation(a, b) {
    return b.relaxedEvaluation - a.relaxedEvaluation;
}

//-------------------------------------------------------------------
// Function: MILP
// Detail: Main function, my attempt at a mixed integer linear programming
//         solver
//-------------------------------------------------------------------
function MILP(tableau) {
    var branches = [];

    var iterations = 0;

    // This is the default result
    // If nothing is both *integral* and *feasible*
    var bestSolution = {
        evaluation: Infinity,
        solutionSet: {},
        feasible: false
    };

    var bestEvaluation = Infinity;

    // And here...we...go!

    // Running solver a first time to obtain an initial solution
    tableau.solve();

    // Saving initial solution
    tableau.save();

    // 1.) Load a model into the queue
    var nbIntegerVariables = tableau.getNumberOfIntegerVariables();
    var branch = new Branch(-Infinity, [], nbIntegerVariables);
    branches.push(branch);

    // If all branches have been exhausted terminate the loop
    while (branches.length > 0) {
        // Get a model from the queue
        branch = branches.pop();

        if (branch.relaxedEvaluation >= bestEvaluation) {
            continue;
        }

        // Restoring initial solution
        tableau.restore();

        // Adding cut constraints
        var cuts = branch.cuts;
        tableau.addCutConstraints(cuts);

        // Solving using initial relaxed solution
        // and addition cut constraints
        tableau.solve();

        // Keep Track of how many cycles
        // we've gone through
        iterations++;

        if (tableau.feasible === false) {
            continue;
        }

        // Is the model both integral and feasible?
        if (tableau.isIntegral() === true) {
            // Is the new result the bestSolution that we've ever had?
            if (tableau.evaluation < bestEvaluation) {
                // Store the solution as the bestSolution
                bestSolution = tableau.compileSolution();
                bestEvaluation = tableau.evaluation;

                // Removing useless branches
                for (var b = 0; b < branches.length; b += 1) {
                    if (branches[b].relaxedEvaluation < bestEvaluation) {
                        if (b !== 0) {
                            branches.splice(0, b);
                        }
                        break;
                    }
                }
            }

            // The solution is feasible and interagal;
            // But it is worse than the current solution;
            // Ignore it.
        } else if (tableau.evaluation < bestEvaluation) {
            // If the solution is
            //  a. Feasible
            //  b. Better than the current solution
            //  c. but *NOT* integral

            // So the solution isn't integral? How do we solve this.
            // We create 2 new models, that are mirror images of the prior
            // model, with 1 exception.

            // Say we're trying to solve some stupid problem requiring you get
            // animals for your daughter's kindergarten petting zoo party
            // and you have to choose how many ducks, goats, and lambs to get.

            // Say that the optimal solution to this problem if we didn't have
            // to make it integral was {duck: 8, lambs: 3.5}
            //
            // To keep from traumatizing your daughter and the other children
            // you're going to want to have whole animals

            // What we would do is find the most fractional variable (lambs)
            // and create new models from the old models, but with a new constraint
            // on apples. The constraints on the low model would look like:
            // constraints: {...
            //   lamb: {max: 3}
            //   ...
            // }
            //
            // while the constraints on the high model would look like:
            //
            // constraints: {...
            //   lamb: {min: 4}
            //   ...
            // }
            // If neither of these models is feasible because of this constraint,
            // the model is not integral at this point, and fails.

            // Find out where we want to split the solution
            // var variable = tableau.getMostFractionalVar();
            var variable = tableau.getFractionalVarWithLowestCost();
            var varIndex = variable.index;

            var cutsHigh = [];
            var cutsLow = [];

            var nCuts = cuts.length;
            for (var c = 0; c < nCuts; c += 1) {
                var cut = cuts[c];
                if (cut.varIndex === varIndex) {
                    if (cut.type === "min") {
                        cutsLow.push(cut);
                    } else {
                        cutsHigh.push(cut);
                    }
                } else {
                    cutsHigh.push(cut);
                    cutsLow.push(cut);
                }
            }

            var cutHigh = new Cut("min", varIndex, Math.ceil(
                variable.value));
            cutsHigh.push(cutHigh);

            var cutLow = new Cut("max", varIndex, Math.floor(
                variable.value));
            cutsLow.push(cutLow);

            var relaxedEvaluation = tableau.evaluation;
            branches.push(new Branch(relaxedEvaluation, cutsHigh));
            branches.push(new Branch(relaxedEvaluation, cutsLow));

            // Sorting branches
            // Branches with the most promising lower bounds
            // will be picked first
            branches.sort(sortByEvaluation);
            // branches.sort(sortByNbIntegers);
            // branches.sort(sortAdvanced);
        }
    }

    bestSolution.iter = iterations;
    return bestSolution;
}
module.exports = MILP;

},{}],2:[function(require,module,exports){
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

    this.nConstraints = 0;
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

Model.prototype.addConstraint = function (constraint) {
    // TODO: make sure that the constraint does not belong do another model
    // and make 
    this.constraints.push(constraint);
    this.nConstraints += 1;
    return this;
};

Model.prototype.smallerThan = function (rhs) {
    var constraint = new Constraint(rhs, true, false);
    this.constraints.push(constraint);
    this.nConstraints += 1;
    return constraint;
};

Model.prototype.greaterThan = function (rhs) {
    var constraint = new Constraint(rhs, false, true);
    this.constraints.push(constraint);
    this.nConstraints += 1;
    return constraint;
};

Model.prototype.equal = function (rhs) {
    var constraint = new Constraint(rhs, true, true);
    this.constraints.push(constraint);
    this.nConstraints += 1;
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
        }

        var min = constraint.min;
        if (min !== undefined) {
            constraintsMinIndexes[constraintId] = this.constraints.length;
            this.constraints.push(new Constraint(min, false, true));
        }

        var max = constraint.max;
        if (max !== undefined) {
            constraintsMaxIndexes[constraintId] = this.constraints.length;
            this.constraints.push(new Constraint(max, true, false));
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

},{"./expressions.js":4}],3:[function(require,module,exports){
/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/

/*************************************************************
 * Class: Tableau
 * Description: Simplex tableau, holding a the tableau matrix
 *              and all the information necessary to perform
 *              the simplex algorithm
 * Agruments:
 *        precision: If we're solving a MILP, how tight
 *                   do we want to define an integer, given
 *                   that 20.000000000000001 is not an integer.
 *                   (defaults to 1e-8)
 **************************************************************/
function Tableau(precision) {
    this.model = null;

    this.matrix = null;
    this.width = 0;
    this.height = 0;

    this.objectiveRowIndex = 0;
    this.rhsColumn = 0;

    this.variableIds = null;

    // Solution attributes
    this.feasible = true; // until proven guilty
    this.evaluation = 0;

    this.basicIndexes = null;
    this.nonBasicIndexes = null;

    this.rows = null;
    this.cols = null;

    this.precision = precision || 1e-8;

    this.savedState = null;
}
module.exports = Tableau;

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Tableau.prototype.initialize = function (width, height, variableIds) {
    this.variableIds = variableIds;

    this.width = width;
    this.height = height;

    // BUILD AN EMPTY ARRAY OF THAT WIDTH
    var tmpRow = new Array(width);
    for (var i = 0; i < width; i++) {
        tmpRow[i] = 0;
    }

    // BUILD AN EMPTY TABLEAU
    this.matrix = new Array(height);
    for (var j = 0; j < height; j++) {
        this.matrix[j] = tmpRow.slice();
    }

    this.basicIndexes = new Array(this.height);
    this.nonBasicIndexes = new Array(this.width);

    this.basicIndexes[0] = -1;
    this.nonBasicIndexes[0] = -1;

    this.nVars = width + height - 2;
    this.rows = new Array(this.nVars);
    this.cols = new Array(this.nVars);
};

//-------------------------------------------------------------------
// Function: solve
// Detail: Main function, linear programming solver
//-------------------------------------------------------------------
Tableau.prototype.solve = function () {
    // Execute Phase 1 to obtain a Basic Feasible Solution (BFS)
    this.phase1();

    // Execute Phase 2
    if (this.feasible === true) {
        // Running simplex on Initial Basic Feasible Solution (BFS)
        // N.B current solution is feasible
        this.phase2();
    }

    return this;
};

function Solution(evaluation, solutionSet, feasible) {
    this.evaluation = evaluation;
    this.solutionSet = solutionSet;
    this.feasible = feasible;
}

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Tableau.prototype.compileSolution = function () {
    var solutionSet = {};

    var nObjectiveVars = this.width - 1;
    var lastRow = this.height - 1;
    var roundingCoeff = Math.round(1 / this.precision);
    for (var r = 1; r <= lastRow; r += 1) {
        var varIndex = this.basicIndexes[r];
        if (varIndex >= nObjectiveVars) {
            continue;
        }

        var variableId = this.variableIds[varIndex];
        if (variableId !== undefined) {
            var varValue = this.matrix[r][this.rhsColumn];
            solutionSet[variableId] =
                Math.round(varValue * roundingCoeff) / roundingCoeff;
        }
    }

    var evaluation = (this.model.minimize === true) ?
        this.evaluation : -this.evaluation;

    return new Solution(evaluation, solutionSet, this.feasible);
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Tableau.prototype.getNumberOfNonIntegralValue = function () {
    var integerVarIndexes = this.model.integerVarIndexes;

    var nIntegerVars = integerVarIndexes.length;
    var nbNonIntegralValues = 0;
    for (var v = 0; v < nIntegerVars; v++) {
        var varIndex = integerVarIndexes[v];
        var varRow = this.rows[varIndex];
        if (varRow === -1) {
            continue;
        }

        var varValue = this.matrix[varRow][this.rhsColumn];
        if (Math.abs(varValue - Math.round(varValue)) > this.precision) {
            nbNonIntegralValues += 1;
        }
    }
    return nbNonIntegralValues;
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Tableau.prototype.isIntegral = function () {
    var integerVarIndexes = this.model.integerVarIndexes;

    var nIntegerVars = integerVarIndexes.length;
    for (var v = 0; v < nIntegerVars; v++) {
        var varIndex = integerVarIndexes[v];
        var varRow = this.rows[varIndex];
        if (varRow === -1) {
            continue;
        }

        var varValue = this.matrix[varRow][this.rhsColumn];
        if (Math.abs(varValue - Math.round(varValue)) > this.precision) {
            return false;
        }
    }
    return true;
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Tableau.prototype.getNumberOfIntegerVariables = function () {
    return this.model.integerVarIndexes.length;
};

function VariableData(index, value) {
    this.index = index;
    this.value = value;
}

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Tableau.prototype.getMostFractionalVar = function () {
    var biggestFraction = 1;
    var selectedVarIndex = null;
    var selectedVarValue = null;
    var mid = 0.49; // No idea why, but 0.49 || 0.51 seem to work better than 0.5

    var integerVarIndexes = this.model.integerVarIndexes;
    var nIntegerVars = integerVarIndexes.length;
    for (var v = 0; v < nIntegerVars; v++) {
        var varIndex = integerVarIndexes[v];
        var varRow = this.rows[varIndex];
        if (varRow === -1) {
            continue;
        }

        var varValue = this.matrix[varRow][this.rhsColumn];
        var fraction = Math.abs(varValue % 1 - mid);
        if (biggestFraction > fraction) {
            biggestFraction = fraction;
            selectedVarIndex = varIndex;
            selectedVarValue = varValue;
        }
    }

    return new VariableData(selectedVarIndex, selectedVarValue);
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Tableau.prototype.getFractionalVarWithLowestCost = function () {
    var highestCost = Infinity;
    var selectedVarIndex = null;
    var selectedVarValue = null;

    var objectiveCosts = this.model.objectiveCosts;
    var integerVarIndexes = this.model.integerVarIndexes;
    var nIntegerVars = integerVarIndexes.length;
    for (var v = 0; v < nIntegerVars; v++) {
        var varIndex = integerVarIndexes[v];
        var varRow = this.rows[varIndex];
        if (varRow === -1) {
            // Variable value is non basic
            // its value is 0
            continue;
        }

        var varValue = this.matrix[varRow][this.rhsColumn];
        if (Math.abs(varValue - Math.round(varValue)) > this.precision) {
            var cost = objectiveCosts[varIndex].value;
            if (highestCost > cost) {
                highestCost = cost;
                selectedVarIndex = varIndex;
                selectedVarValue = varValue;
            }
        }
    }

    return new VariableData(selectedVarIndex, selectedVarValue);
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Tableau.prototype.setEvaluation = function () {
    // Rounding objective value
    var roundingCoeff = Math.round(1 / this.precision);
    var evaluation = this.matrix[this.objectiveRowIndex][this.rhsColumn];
    this.evaluation =
        Math.round(evaluation * roundingCoeff) / roundingCoeff;
};

//-------------------------------------------------------------------
// Description: Convert a non standard form tableau
//              to a standard form tableau by eliminating
//              all negative values in the Right Hand Side (RHS)
//              This results in a Basic Feasible Solution (BFS)
//
//-------------------------------------------------------------------
Tableau.prototype.phase1 = function () {
    var matrix = this.matrix;
    var rhsColumn = this.rhsColumn;
    var lastColumn = this.width - 1;
    var lastRow = this.height - 1;

    var iterations = 0;
    while (true) {
        // Selecting leaving variable (feasibility condition):
        // Basic variable with most negative value
        var leavingRowIndex = 0;
        var rhsValue = -this.precision;
        for (var r = 1; r <= lastRow; r++) {
            var value = matrix[r][rhsColumn];
            if (value < rhsValue) {
                rhsValue = value;
                leavingRowIndex = r;
            }
        }

        // If nothing is strictly smaller than 0; we're done with phase 1.
        if (leavingRowIndex === 0) {
            // Feasible, champagne!
            this.feasible = true;
            return iterations;
        }

        // Selecting entering variable
        var enteringColumn = 0;
        var minQuotient = Infinity;

        var leavingRow = matrix[leavingRowIndex];
        for (var c = 1; c <= lastColumn; c++) {
            var colValue = leavingRow[c];
            if (colValue === 0) {
                continue;
            }

            var quotient = rhsValue / colValue;
            if (quotient >= 0 && minQuotient > quotient) {
                minQuotient = quotient;
                enteringColumn = c;
            }
        }

        if (minQuotient === Infinity) {
            // Not feasible
            this.feasible = false;
            return iterations;
        }

        this.pivot(leavingRowIndex, enteringColumn);
        iterations += 1;
    }
};

//-------------------------------------------------------------------
// Description: Apply simplex to obtain optimal soltuion
//              used as phase2 of the simplex
//
//-------------------------------------------------------------------
Tableau.prototype.phase2 = function () {
    var matrix = this.matrix;
    var rhsColumn = this.rhsColumn;
    var lastColumn = this.width - 1;
    var lastRow = this.height - 1;

    var precision = this.precision;

    var iterations = 0;
    while (true) {
        var objectiveRow = matrix[this.objectiveRowIndex];

        // Selecting entering variable (optimality condition)
        var enteringColumn = 0;
        var enteringValue = this.precision;
        for (var c = 1; c <= lastColumn; c++) {
            var value = objectiveRow[c];
            if (value > enteringValue) {
                enteringValue = value;
                enteringColumn = c;
            }
        }

        // If nothing is greater than 0; we're done with phase 2.
        if (enteringColumn === 0) {
            this.setEvaluation();
            return;
        }

        // Selecting leaving variable
        var leavingRow = 0;
        var minQuotient = Infinity;

        for (var r = 1; r <= lastRow; r++) {
            var row = matrix[r];
            var rhsValue = row[rhsColumn];
            var colValue = row[enteringColumn];
            if (precision > rhsValue && rhsValue > -precision) {
                if (colValue > precision) {
                    minQuotient = 0;
                    leavingRow = r;
                    break;
                }
                continue;
            }

            var quotient = rhsValue / colValue;
            if (quotient > 0 && minQuotient > quotient) {
                minQuotient = quotient;
                leavingRow = r;
            }
        }

        if (minQuotient === Infinity) {
            // TODO: solution is not bounded
            // optimal value is -Infinity
            this.evaluation = -Infinity;
            return;
        }

        this.pivot(leavingRow, enteringColumn);
        iterations += 1;
    }
};

//-------------------------------------------------------------------
// Description: Execute pivot operations over a 2d array,
//          on a given row, and column
//
//-------------------------------------------------------------------
var nonZeroColumns = [];
Tableau.prototype.pivot = function (pivotRowIndex, pivotColumnIndex) {
    var matrix = this.matrix;
    var quotient = matrix[pivotRowIndex][pivotColumnIndex];

    var lastRow = this.height - 1;
    var lastColumn = this.width - 1;

    var leavingBasicIndex = this.basicIndexes[pivotRowIndex];
    var enteringBasicIndex = this.nonBasicIndexes[pivotColumnIndex];

    this.basicIndexes[pivotRowIndex] = enteringBasicIndex;
    this.nonBasicIndexes[pivotColumnIndex] = leavingBasicIndex;

    this.rows[enteringBasicIndex] = pivotRowIndex;
    this.rows[leavingBasicIndex] = -1;

    this.cols[enteringBasicIndex] = -1;
    this.cols[leavingBasicIndex] = pivotColumnIndex;

    // Divide everything in the target row by the element @
    // the target column
    var pivotRow = matrix[pivotRowIndex];

    var nNonZeroColumns = 0;
    for (var c = 0; c <= lastColumn; c++) {
        if (pivotRow[c] !== 0) {
            pivotRow[c] /= quotient;
            nonZeroColumns[nNonZeroColumns] = c;
            nNonZeroColumns += 1;
        }
    }


    // for every row EXCEPT the pivot row,
    // set the value in the pivot column = 0 by
    // multiplying the value of all elements in the objective
    // row by ... yuck... just look below; better explanation later
    var precision = this.precision;
    for (var r = 0; r <= lastRow; r++) {
        var row = matrix[r];
        if (r !== pivotRowIndex) {
            var coefficient = row[pivotColumnIndex];
            // No point Burning Cycles if
            // Zero to the thing
            if (coefficient !== 0) {
                for (var i = 0; i < nNonZeroColumns; i++) {
                    c = nonZeroColumns[i];
                    // No point in doing math if you're just adding
                    // Zero to the thing
                    var v0 = pivotRow[c];
                    if (v0 !== 0) {
                        var v1 = row[c] - coefficient * v0;
                        row[c] = v1;
                    }
                }

                row[pivotColumnIndex] = -coefficient / quotient;
            }
        }
    }

    pivotRow[pivotColumnIndex] = 1 / quotient;
};

Tableau.prototype.copy = function () {
    var copy = new Tableau(this.precision);

    copy.width = this.width;
    copy.height = this.height;

    copy.nVars = this.nVars;
    copy.model = this.model;
    copy.nObjectiveVars = this.nObjectiveVars;

    // Making a shallow copy of integer variable indexes
    // and variable ids
    copy.integerIndexes = this.integerIndexes;
    copy.variableIds = this.variableIds;

    // All the other arrays are deep copied
    copy.basicIndexes = this.basicIndexes.slice();
    copy.nonBasicIndexes = this.nonBasicIndexes.slice();

    copy.rows = this.rows.slice();
    copy.cols = this.cols.slice();


    var matrix = this.matrix;
    var matrixCopy = new Array(this.height);
    for (var r = 0; r < this.height; r++) {
        matrixCopy[r] = matrix[r].slice();
    }

    copy.matrix = matrixCopy;

    return copy;
};

Tableau.prototype.save = function () {
    this.savedState = this.copy();
};

Tableau.prototype.restore = function () {
    if (this.savedState === null) {
        console.warn("[Tableau.restore] No saved state!");
        return;
    }

    var save = this.savedState;
    var savedMatrix = save.matrix;
    this.nVars = save.nVars;
    this.model = save.model;
    this.variableIds = save.variableIds;
    this.integerIndexes = save.integerIndexes;
    this.nObjectiveVars = save.nObjectiveVars;

    this.width = save.width;
    this.height = save.height;

    // Restoring matrix
    var r, c;
    for (r = 0; r < this.height; r += 1) {
        var savedRow = savedMatrix[r];
        var row = this.matrix[r];
        for (c = 0; c < this.width; c += 1) {
            row[c] = savedRow[c];
        }
    }

    // Restoring all the other structures
    var savedBasicIndexes = save.basicIndexes;
    for (c = 0; c < this.height; c += 1) {
        this.basicIndexes[c] = savedBasicIndexes[c];
    }

    while (this.basicIndexes.length > this.height) {
        this.basicIndexes.pop();
    }

    var savedNonBasicIndexes = save.nonBasicIndexes;
    for (r = 0; r < this.width; r += 1) {
        this.nonBasicIndexes[r] = savedNonBasicIndexes[r];
    }

    while (this.nonBasicIndexes.length > this.width) {
        this.nonBasicIndexes.pop();
    }

    var savedRows = save.rows;
    var savedCols = save.cols;
    for (var v = 0; v < this.nVars; v += 1) {
        this.rows[v] = savedRows[v];
        this.cols[v] = savedCols[v];
    }
};

Tableau.prototype.addCutConstraints = function (cutConstraints) {
    var nCutConstraints = cutConstraints.length;

    var heightWithoutCuts = this.model.nConstraints + 1;
    var heightWithCuts = heightWithoutCuts + nCutConstraints;

    // Adding rows to hold cut constraints
    for (var h = heightWithoutCuts; h < heightWithCuts; h += 1) {
        if (this.matrix[h] === undefined) {
            this.matrix[h] = this.matrix[h - 1].slice();
        }
    }

    // Adding cut constraints
    this.height = heightWithCuts;

    var nObjectiveVars = this.model.nVariables;
    this.nVars = this.model.nConstraints + nObjectiveVars + nCutConstraints;
    var c;
    for (var i = 0; i < nCutConstraints; i += 1) {
        var cut = cutConstraints[i];

        // Constraint row index
        var r = heightWithoutCuts + i;

        var sign = (cut.type === "min") ? -1 : 1;

        // Variable on which the cut is applied
        var varIndex = cut.varIndex;
        var varRowIndex = this.rows[varIndex];

        var constraintRow = this.matrix[r];
        if (varRowIndex === -1) {
            // Variable is non basic
            constraintRow[this.rhsColumn] = sign * cut.value;
            for (c = 1; c <= nObjectiveVars; c += 1) {
                constraintRow[c] = 0;
            }
            constraintRow[this.cols[varIndex]] = sign;
        } else {
            // Variable is basic
            var varRow = this.matrix[varRowIndex];
            var varValue = varRow[this.rhsColumn];
            constraintRow[this.rhsColumn] = sign * (cut.value - varValue);
            for (c = 1; c <= nObjectiveVars; c += 1) {
                constraintRow[c] = -sign * varRow[c];
            }
        }

        // Creating slack variable
        var slackVarIndex = nObjectiveVars + r - 1;
        this.basicIndexes[r] = slackVarIndex;

        this.rows[slackVarIndex] = r;
        this.cols[slackVarIndex] = -1;
    }
};

Tableau.prototype.density = function () {
    var density = 0;

    var matrix = this.matrix;
    for (var r = 0; r < this.height; r++) {
        var row = matrix[r];
        for (var c = 0; c < this.width; c++) {
            if (row[c] !== 0) {
                density += 1;
            }
        }
    }

    return density / (this.height * this.width);
};

Tableau.prototype._resetMatrix = function () {
    var variableIds = this.model.variableIds;
    var constraints = this.model.constraints;

    var nObjectiveVars = variableIds.length;
    var nConstraints = constraints.length;

    for (var c = 0; c < nConstraints; c += 1) {
        var rowIndex = c + 1;
        var constraint = constraints[c];
        var row = this.matrix[rowIndex];

        var t, term;
        var terms = constraint.terms;
        var nTerms = terms.length;
        if (constraint.isUpperBound) {
            for (t = 0; t < nTerms; t += 1) {
                term = terms[t];
                row[term.variable.index + 1] = term.coefficient.value;
            }

            row[0] = constraint.rhs.value;
        }

        if (constraint.isLowerBound) {
            for (t = 0; t < nTerms; t += 1) {
                term = terms[t];
                row[term.variable.index + 1] = -term.coefficient.value;
            }

            row[0] = -constraint.rhs.value;
        }

        var varIndex = nObjectiveVars + c;
        this.basicIndexes[rowIndex] = varIndex;
    }

    var v;
    var objectiveCosts = this.model.objectiveCosts;

    var objectiveRow = this.matrix[0];
    if (this.model.minimize === true) {
        for (v = 0; v < nObjectiveVars; v += 1) {
            objectiveRow[v + 1] = -objectiveCosts[v].value;
        }
    } else {
        for (v = 0; v < nObjectiveVars; v += 1) {
            objectiveRow[v + 1] = objectiveCosts[v].value;
        }
    }

    for (v = 0; v < nObjectiveVars; v += 1) {
        this.rows[v] = -1;
        this.cols[v] = v + 1;
        this.nonBasicIndexes[v + 1] = v;
    }

    for (v = nObjectiveVars; v < this.nVars; v += 1) {
        this.rows[v] = v - nObjectiveVars + 1;
        this.cols[v] = -1;
    }
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Tableau.prototype.generateFromModel = function (model) {
    this.model = model;

    var width = model.nVariables + 1;
    var height = model.nConstraints + 1;

    this.initialize(width, height, model.variableIds);
    this._resetMatrix();
};


//-------------------------------------------------------------------
// Description: Display a tableau matrix
//              and additional tableau information
//
//-------------------------------------------------------------------
Tableau.prototype.log = function (message, force) {
    if (false && !force) {
        return;
    }

    console.log("****", message, "****");
    console.log("Nb Variables", this.width - 1);
    console.log("Nb Constraints", this.height - 1);
    console.log("Variable Ids", this.variableIds);
    console.log("Basic Indexes", this.basicIndexes);
    console.log("Non Basic Indexes", this.nonBasicIndexes);
    console.log("Rows", this.rows);
    console.log("Cols", this.cols);

    // Variable declaration
    var varNameRowString = "",
        spacePerColumn = [" "],
        j,
        c,
        s,
        r,
        varName,
        varNameLength,
        nSpaces,
        valueSpace,
        nameSpace;

    var row,
        rowString;

    for (c = 1; c < this.width; c += 1) {
        varName = this.variableIds[this.nonBasicIndexes[c]];
        if (varName === undefined) {
            varName = "v" + this.nonBasicIndexes[c];
        }

        varNameLength = varName.length;
        nSpaces = Math.abs(varNameLength - 5);
        valueSpace = " ";
        nameSpace = " ";

        for (s = 0; s < nSpaces; s += 1) {
            if (varNameLength > 5) {
                valueSpace += " ";
            } else {
                nameSpace += " ";
            }
        }
        spacePerColumn[c] = valueSpace;

        varNameRowString += nameSpace + varName;
    }
    console.log(varNameRowString);

    var signSpace;

    // Displaying objective
    var firstRow = this.matrix[this.objectiveRowIndex];
    var firstRowString = "";
    for (j = 1; j < this.width; j += 1) {
        signSpace = firstRow[j] < 0 ? "" : " ";
        firstRowString += signSpace;
        firstRowString += spacePerColumn[j];
        firstRowString += firstRow[j].toFixed(2);
    }
    signSpace = firstRow[0] < 0 ? "" : " ";
    firstRowString += signSpace + spacePerColumn[0] +
        firstRow[0].toFixed(2);
    console.log(firstRowString + " Z");

    // Then the basic variable rows
    for (r = 1; r < this.height; r += 1) {
        row = this.matrix[r];
        rowString = "";
        for (c = 1; c < this.width; c += 1) {
            signSpace = row[c] < 0 ? "" : " ";
            rowString += signSpace + spacePerColumn[c] + row[c].toFixed(
                2);
        }
        signSpace = row[0] < 0 ? "" : " ";
        rowString += signSpace + spacePerColumn[0] + row[0].toFixed(
            2);

        varName = this.variableIds[this.basicIndexes[r]];
        if (varName === undefined) {
            varName = "v" + this.basicIndexes[r];
        }
        console.log(rowString + " " + varName);
    }
    console.log("");
};

},{}],4:[function(require,module,exports){
/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/

//-------------------------------------------------------------------
//-------------------------------------------------------------------
function Numeral(value) {
    if (this instanceof Numeral) {
        this.value = value;
    } else {
        if (value instanceof Numeral) {
            return value;
        } else {
            return new Numeral(value);
        }
    }
}

Numeral.prototype.set = function (value) {
    if (value !== this.value) {
        this.value = value;
        this._dirty = true;
        // TODO: set constraint and model as dirty
    }
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
function Variable(name, index) {
    this.name = name;
    this.index = index;
    this.value = 0;
}

//-------------------------------------------------------------------
//-------------------------------------------------------------------
function Term(coefficient, variable) {
    this.coefficient = Numeral(coefficient);
    this.variable = variable;
}

Term.prototype.setCoefficient = function (coefficient) {
    this.coefficient = Numeral(coefficient);
    this._dirty = true;
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
function Constraint(rhs, isUpperBound, isLowerBound) {
    this.rhs = Numeral(rhs);
    this.terms = [];

    this.isUpperBound = isUpperBound;
    this.isLowerBound = isLowerBound;
}

Constraint.prototype.addTerm = function (term) {
    this.terms.push(term);
    return this;
};

Constraint.prototype.removeTerm = function (term) {
    // TODO
    return this;
};


module.exports = {
    Variable: Variable,
    Numeral: Numeral,
    Term: Term,
    Constraint: Constraint
};

// var model = new JSPL.Model().maximize();

// var var1 = model.createVariable('x1', -4);
// var var2 = model.createVariable('x2', -2);
// var var3 = model.createVariable('x3',  1);

// var cst1 = model.smallerThan(-3).addTerm(Term(-1, var1)).addTerm(Term(-1, var2)).addTerm(Term( 2, var3));
// var cst2 = model.smallerThan(-4).addTerm(Term(-4, var1)).addTerm(Term(-2, var2)).addTerm(Term( 1, var3));
// var cst2 = model.smallerThan( 2).addTerm(Term( 1, var1)).addTerm(Term( 1, var2)).addTerm(Term(-4, var3));

},{}],5:[function(require,module,exports){
/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/


//-------------------------------------------------------------------
// SimplexJS
// https://github.com/
// An Object-Oriented Linear Programming Solver
//
// By Justin Wolcott (c)
// Licensed under the MIT License.
//-------------------------------------------------------------------

var Tableau = require("./Tableau");
var Model = require("./Model");
var MILP = require("./MILP");

// Place everything under the Solver Name Space
var Solver = function () {

    "use strict";

    /*************************************************************
     * Method: Solve
     * Scope: Public:
     * Agruments:
     *        model: The model we want solver to operate on
     *        precision: If we're solving a MILP, how tight
     *                   do we want to define an integer, given
     *                   that 20.000000000000001 is not an integer.
     *                   (defaults to 1e-9)
     **************************************************************/
    this.Solve = function (model, precision, full) {
        // Make sure we at least have a model
        if (!model) {
            throw new Error("Solver requires a model to operate on");
        }

        var tableau = new Tableau(precision);
        if (model instanceof Model === false) {
            model = new Model().loadJson(model);
        }
        tableau.generateFromModel(model);

        var solution;
        if (tableau.getNumberOfIntegerVariables() > 0) {
            solution = MILP(tableau);
        } else {
            tableau.solve();
            solution = tableau.compileSolution();
        }

        // If the user asks for a full breakdown
        // of the tableau (e.g. full === true)
        // this will return it
        if (full) {
            return solution;
        } else {
            // Otherwise; give the user the bare
            // minimum of info necessary to carry on

            var store = {};

            // 1.) Add in feasibility to store;
            store.feasible = solution.feasible;

            // 2.) Add in the objective value
            store.result = solution.evaluation;

            // 3.) Load all of the variable values
            Object.keys(solution.solutionSet)
                .map(function (d) {
                    store[d] = solution.solutionSet[d];
                });

            return store;
        }

    };

    /*************************************************************
     * Method: Model
     * Scope: Public:
     * Agruments: model: The model we want solver to operate on
     * Purpose: Convert a friendly JSON model into a model for a
     *          real solving library...in this case
     *          lp_solver
     **************************************************************/
    this.ReformatLP = function (model, fx) {
        // Make sure we at least have a model
        if (!model) {
            throw new Error("Solver requires a model to operate on");
        }

        var constraints, variables, hash, len, i, j, x, c, v,
            rslts, tmpRow, table, val,
            tall = 1,
            wide = 1,
            z = 0,
            opType = model.opType === "max" ? -1 : 1,
            rxClean = new RegExp("[^A-Za-z0-9]+", "gi");


        //Give all of the variables a self property of 1
        for (v in model.variables) {
            model.variables[v][v] = 1;
            //if a min or max exists in the variables;
            //add it to the constraints
            if (typeof model.variables[v].max !== "undefined") {
                model.constraints[v] = model.constraints[v] || {};
                model.constraints[v].max = model.variables[v].max;
            }

            if (typeof model.variables[v].min !== "undefined") {
                model.constraints[v] = model.constraints[v] || {};
                model.constraints[v].min = model.variables[v].min;
            }
        }

        constraints = Object.keys(model.constraints); //Array with name of each constraint type
        variables = Object.keys(model.variables); //Array with name of each Variable

        // FIGURE OUT HEIGHT
        for (x in model.constraints) {
            if (typeof model.constraints[x].min !== "undefined") {
                model.constraints[x].min_loc = tall - 1;
                tall += 1;
            }

            if (typeof model.constraints[x].max !== "undefined") {
                model.constraints[x].max_loc = tall - 1;
                tall += 1;
            }
        }

        // FIGURE OUT WIDTH
        wide += variables.length;

        // BUILD A FAKE ROW OF THAT WIDTH
        tmpRow = new Array(wide);

        // BUILD AN EMPTY TABLEAU
        /* jshint ignore:start */
        table = new Array(tall);
        for (i = 0; i < tall; i++) {
            table[i] = []; //tmpRow.slice();
        }
        /* jshint ignore:end */

        // LOOP IT AGAIN!!!
        z = 0;
        for (x in model.constraints) {
            if (typeof model.constraints[x].min !== "undefined") {
                // DO RHS
                table[z][wide - 1] = " >= " + model.constraints[x].min;
                // COUNTER += 1...
                z += 1;
            }

            if (typeof model.constraints[x].max !== "undefined") {
                // DO RHS
                table[z][wide - 1] = " <= " + model.constraints[x].max;
                // COUNTER += 1...
                z += 1;
            }
        }

        // TRY LOADING THE TABLE
        for (v in model.variables) {
            // Get the column's location
            var col = variables.indexOf(v);
            for (var a in model.variables[v]) {
                // This is the thing we're trying to optimize...
                if (a === model.optimize) {
                    val = model.variables[v][a];
                    if (col !== 0) {
                        if (val > 0) {
                            val = " + " + val;
                        } else {
                            val = " - " + -val;
                        }
                    }
                    table[tall - 1][col] = val + " ";
                    table[tall - 1][col] += v.replace(rxClean, "_");
                } else if (typeof model.constraints[a] !== "undefined") {
                    var row,
                        cns = model.constraints[a];

                    if (typeof cns.min !== "undefined") {
                        row = cns.min_loc;
                        val = model.variables[v][a];
                        if (col !== 0) {
                            if (val > 0) {
                                val = " + " + val;
                            } else {
                                val = " - " + -val;
                            }
                        }
                        table[row][col] = val;
                        table[row][col] += " ";
                        table[row][col] += v.replace(rxClean, "_");
                    }

                    if (typeof cns.max !== "undefined") {
                        row = cns.max_loc;
                        val = model.variables[v][a];
                        if (col !== 0) {
                            if (val > 0) {
                                val = " + " + val;
                            } else {
                                val = " - " + -val;
                            }
                        }
                        table[row][col] = val;
                        table[row][col] += " ";
                        table[row][col] += v.replace(rxClean, "_");
                    }
                }
            }
        }

        var outTbl = [];

        // ADD ALL OF THE EQUATIONS TO THE NEW TABLE
        // IN REVERSE (SINCE MY OBJECTIVE ROW IS AT BOTTOM)
        // AND JOIN THEM ALL TOGETHER, LAZILY CLEANING
        // IT UP AS WE GO
        for (i = table.length - 1; i >= 0; i--) {
            outTbl.push((table[i].join("") + ";")
                .replace(/^ \+ /gi, ""));
        }

        // BECAUSE IT SEEMS TO SCREW UP...
        outTbl[0] = model.opType + ": " + outTbl[0];

        // ADD INTS IF THERE ARE IN FACT ANY...
        if (model.ints) {
            var ary = Object.keys(model.ints);
            // Push in a blank row to the rslts array
            outTbl.push("");
            for (i = 0; i < ary.length; i++) {
                outTbl.push("int " + ary[i].replace(/[^A-Za-z0-9]+/gi,
                    "_") + ";");
            }
        }
        return outTbl;
    };
};

// Determine the environment we're in.
// if we're in node, offer a friendly exports
// otherwise, Solver's going global
/* jshint ignore:start */
/*
(function () {
    if (typeof module !== "undefined" && module.exports) {
        module.exports = new Solver();
    } else if (typeof define === "function") {
        define([], function () {
            return Solver;
        });
    }
})();
*/
(function(){
    // If define exists; use it
    if (typeof define === "function") {       
        define([], function () {
            return new Solver();
        });
    } else if(typeof window === "object"){
        window.solver = new Solver();
    } else {
        console.log("FUCK IT");
        module.exports =  new Solver();
    }   
})()

/* jshint ignore:end */

},{"./MILP":1,"./Model":2,"./Tableau":3}]},{},[5]);
