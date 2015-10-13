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

    this.costRowIndex = 0;
    this.rhsColumn = 0;

    this.variableIds = null;
    this.unrestrictedVars = null;

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
Tableau.prototype.initialize = function (width, height, variableIds, unrestrictedVars) {
    this.variableIds = variableIds;
    this.unrestrictedVars = unrestrictedVars;

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

    var lastRow = this.height - 1;
    var roundingCoeff = Math.round(1 / this.precision);
    for (var r = 1; r <= lastRow; r += 1) {
        var varIndex = this.basicIndexes[r];
        var variableId = this.variableIds[varIndex];
        if (variableId !== undefined) {
            var varValue = this.matrix[r][this.rhsColumn];
            solutionSet[variableId] =
                Math.round(varValue * roundingCoeff) / roundingCoeff;
        }
    }

    var evaluation = (this.model.isMinimization === true) ?
        this.evaluation : -this.evaluation;

    return new Solution(evaluation, solutionSet, this.feasible);
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Tableau.prototype.isIntegral = function () {
    var integerVariables = this.model.integerVariables;

    var nIntegerVars = integerVariables.length;
    for (var v = 0; v < nIntegerVars; v++) {
        var varRow = this.rows[integerVariables[v].index];
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
    var mid = 0.5;

    var integerVariables = this.model.integerVariables;
    var nIntegerVars = integerVariables.length;
    for (var v = 0; v < nIntegerVars; v++) {
        var varIndex = integerVariables[v].index;
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

    var integerVariables = this.model.integerVariables;
    var nIntegerVars = integerVariables.length;
    for (var v = 0; v < nIntegerVars; v++) {
        var variable = integerVariables[v];
        var varIndex = variable.index;
        var varRow = this.rows[varIndex];
        if (varRow === -1) {
            // Variable value is non basic
            // its value is 0
            continue;
        }

        var varValue = this.matrix[varRow][this.rhsColumn];
        if (Math.abs(varValue - Math.round(varValue)) > this.precision) {
            var cost = variable.cost;
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
    var evaluation = this.matrix[this.costRowIndex][this.rhsColumn];
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

    var unrestricted;
    var iterations = 0;
    while (true) {
        // Selecting leaving variable (feasibility condition):
        // Basic variable with most negative value
        var leavingRowIndex = 0;
        var rhsValue = -this.precision;
        for (var r = 1; r <= lastRow; r++) {
            unrestricted = this.unrestrictedVars[this.basicIndexes[r]] === true;
            if (unrestricted) {
                continue;
            }

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
        var maxQuotient = -Infinity;
        var costRow = matrix[0];
        var leavingRow = matrix[leavingRowIndex];
        for (var c = 1; c <= lastColumn; c++) {
            var colValue = leavingRow[c];
            if (-this.precision < colValue && colValue < this.precision) {
                continue;
            }

            unrestricted = this.unrestrictedVars[this.nonBasicIndexes[c]] === true;
            if (unrestricted || colValue < -this.precision) {
                var quotient = -costRow[c] / colValue;
                if (maxQuotient < quotient) {
                    maxQuotient = quotient;
                    enteringColumn = c;
                }
            }
        }

        if (enteringColumn === 0) {
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
        var costRow = matrix[this.costRowIndex];

        // Selecting entering variable (optimality condition)
        var enteringColumn = 0;
        var enteringValue = this.precision;
        var isNegative = false;
        for (var c = 1; c <= lastColumn; c++) {
            var value = costRow[c];
            var unrestricted = this.unrestrictedVars[this.nonBasicIndexes[c]] === true;
            if (unrestricted && value < 0) {
                if (-value > enteringValue) {
                    enteringValue = -value;
                    enteringColumn = c;
                    isNegative = true;
                }
            }

            if (value > enteringValue) {
                enteringValue = value;
                enteringColumn = c;
                isNegative = false;
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

            if (-precision < colValue && colValue < precision) {
                continue;
            }

            if (colValue > 0 && precision > rhsValue && rhsValue > -precision) {
                minQuotient = 0;
                leavingRow = r;
                break;
            }

            var quotient = isNegative ? -rhsValue / colValue : rhsValue / colValue;
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

        this.pivot(leavingRow, enteringColumn, true);
        iterations += 1;
    }
};

// Array holding the column indexes for which the value is not null
// on the pivot row
// Shared by all tableaux for smaller overhead and lower memory usage
var nonZeroColumns = [];
//-------------------------------------------------------------------
// Description: Execute pivot operations over a 2d array,
//          on a given row, and column
//
//-------------------------------------------------------------------
Tableau.prototype.pivot = function (pivotRowIndex, pivotColumnIndex, debug) {
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
    pivotRow[pivotColumnIndex] = 1 / quotient;

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
                        row[c] = row[c] - coefficient * v0;
                    }
                }

                row[pivotColumnIndex] = -coefficient / quotient;
            }
        }
    }
};

Tableau.prototype.copy = function () {
    var copy = new Tableau(this.precision);

    copy.width = this.width;
    copy.height = this.height;

    copy.nVars = this.nVars;
    copy.model = this.model;

    // Making a shallow copy of integer variable indexes
    // and variable ids
    copy.integerIndexes = this.integerIndexes;
    copy.variableIds = this.variableIds;
    copy.unrestrictedVars = this.unrestrictedVars;

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
    this.unrestrictedVars = save.unrestrictedVars;

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

    var height = this.model.nConstraints + 1;
    var heightWithCuts = height + nCutConstraints;

    // Adding rows to hold cut constraints
    for (var h = height; h < heightWithCuts; h += 1) {
        if (this.matrix[h] === undefined) {
            this.matrix[h] = this.matrix[h - 1].slice();
        }
    }

    // Adding cut constraints
    this.height = heightWithCuts;
    this.nVars = this.width + this.height - 2;

    var c;
    var lastColumn = this.width - 1;
    for (var i = 0; i < nCutConstraints; i += 1) {
        var cut = cutConstraints[i];

        // Constraint row index
        var r = height + i;

        var sign = (cut.type === "min") ? -1 : 1;

        // Variable on which the cut is applied
        var varIndex = cut.varIndex;
        var varRowIndex = this.rows[varIndex];
        var constraintRow = this.matrix[r];
        if (varRowIndex === -1) {
            // Variable is non basic
            constraintRow[this.rhsColumn] = sign * cut.value;
            for (c = 1; c <= lastColumn; c += 1) {
                constraintRow[c] = 0;
            }
            constraintRow[this.cols[varIndex]] = sign;
        } else {
            // Variable is basic
            var varRow = this.matrix[varRowIndex];
            var varValue = varRow[this.rhsColumn];
            constraintRow[this.rhsColumn] = sign * (cut.value - varValue);
            for (c = 1; c <= lastColumn; c += 1) {
                constraintRow[c] = -sign * varRow[c];
            }
        }

        // Creating slack variable
        var slackVarIndex = lastColumn + r - 1;
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

Tableau.prototype._putInBase = function (varIndex) {
    // Is varIndex in the base?
    var r = this.rows[varIndex];
    if (r === -1) {
        // Outside the base
        // pivoting to take it out
        var c = this.cols[varIndex];

        // Selecting pivot row
        // (Any row with coefficient different from 0)
        for (var r1 = 1; r1 < this.height; r1 += 1) {
            var coefficient = this.matrix[r1][c];
            if (coefficient < -this.precision || this.precision < coefficient) {
                r = r1;
                break;
            }
        }

        this.pivot(r, c);
    }

    return r;
};

Tableau.prototype._takeOutOfBase = function (varIndex) {
    // Is varIndex in the base?
    var c = this.cols[varIndex];
    if (c === -1) {
        // Inside the base
        // pivoting to take it out
        var r = this.rows[varIndex];

        // Selecting pivot column
        // (Any column with coefficient different from 0)
        var pivotRow = this.matrix[r];
        for (var c1 = 1; c1 < this.height; c1 += 1) {
            var coefficient = pivotRow[c1];
            if (coefficient < -this.precision || this.precision < coefficient) {
                c = c1;
                break;
            }
        }

        this.pivot(r, c);
    }

    return c;
};

Tableau.prototype.updateRightHandSide = function (constraint, difference) {
    // Updates RHS of given constraint
    var lastRow = this.height - 1;
    var constraintRow = this.rows[constraint.index];
    if (constraintRow === -1) {
        // Slack is not in base
        var slackColumn = this.cols[constraint.index];

        // Upading all the RHS values
        for (var r = 0; r <= lastRow; r += 1) {
            var row = this.matrix[r];
            row[this.rhsColumn] -= difference * row[slackColumn];
        }
    } else {
        // Slack variable of constraint is in base
        // Updating RHS with the difference between the old and the new one
        this.matrix[constraintRow][this.rhsColumn] -= difference;
    }
};

Tableau.prototype.updateConstraintCoefficient = function (constraint, variable, difference) {
    // Updates variable coefficient within a constraint
    // TODO: optimize, can be a little heavy (no more than one pivot necessary)

    // Putting the constraint in the base
    var r = this._putInBase(constraint.index);

    // Putting the variable out of the base
    var c = this._takeOutOfBase(variable.index);

    // Updating coefficient with the difference
    // between the old and the new one
    this.matrix[r][c] -= difference;
};

Tableau.prototype.updateCost = function (variable, difference) {
    // Updates variable coefficient within the objective function
    var varIndex = variable.index;
    var lastColumn = this.width - 1;
    var varColumn = this.cols[varIndex];
    if (varColumn === -1) {
        // Variable is in base
        var variableRow = this.matrix[this.rows[varIndex]];
        var costRow = this.matrix[0];

        // Upading all the objective values
        for (var c = 0; c <= lastColumn; c += 1) {
            costRow[c] += difference * variableRow[c];
        }
    } else {
        // Variable is not in the base
        // Updating coefficient with difference
        this.matrix[0][varColumn] -= difference;
    }
};

Tableau.prototype.addConstraint = function (constraint) {
    // Adds a constraint to the tableau
    var sign = constraint.isUpperBound ? 1 : -1;
    var lastRow = this.height;

    var constraintRow = this.matrix[lastRow];
    if (constraintRow === undefined) {
        constraintRow = this.matrix[0].slice();
        this.matrix[lastRow] = constraintRow;
    }

    // Setting all row cells to 0
    var lastColumn = this.width - 1;
    for (var c = 0; c <= lastColumn; c += 1) {
        constraintRow[c] = 0;
    }

    // Initializing RHS
    constraintRow[this.rhsColumn] = sign * constraint.rhs;

    var terms = constraint.terms;
    var nTerms = terms.length;
    for (var t = 0; t < nTerms; t += 1) {
        var term = terms[t];
        var coefficient = term.coefficient;
        var varIndex = term.variable.index;

        var varRowIndex = this.rows[varIndex];
        if (varRowIndex === -1) {
            // Variable is non basic
            constraintRow[this.cols[varIndex]] += sign * coefficient;
        } else {
            // Variable is basic
            var varRow = this.matrix[varRowIndex];
            var varValue = varRow[this.rhsColumn];
            for (c = 0; c <= lastColumn; c += 1) {
                constraintRow[c] -= sign * coefficient * varRow[c];
            }
        }
    }

    // Creating slack variable
    var slackIndex = constraint.index;
    this.basicIndexes[lastRow] = slackIndex;

    this.rows[slackIndex] = lastRow;
    this.cols[slackIndex] = -1;

    this.height += 1;
};

Tableau.prototype.removeConstraint = function (constraint) {
    var slackIndex = constraint.index;
    var lastRow = this.height - 1;

    // Putting the constraint in the base
    var r = this._putInBase(slackIndex);

    // Removing constraint
    // by putting the corresponding row at the bottom of the matrix
    // and virtually reducing the height of the matrix by 1
    var tmpRow = this.matrix[lastRow];
    this.matrix[lastRow] = this.matrix[r];
    this.matrix[r] = tmpRow;

    // Removing associated slack variable from basic variables
    this.basicIndexes[slackIndex] = -1;
    this.rows[slackIndex] = -1;

    this.height -= 1;
};


Tableau.prototype.addVariable = function (variable, cost) {
    // Adds a variable to the tableau
    // var sign = constraint.isUpperBound ? 1 : -1;

    var lastRow = this.height - 1;
    var lastColumn = this.width;

    // Setting objective coefficient
    if (this.model.isMinimization === true) {
        this.matrix[0][lastColumn] = -cost;
    } else {
        this.matrix[0][lastColumn] = cost;
    }

    // Setting all other column cells to 0
    for (var r = 1; r <= lastRow; r += 1) {
        this.matrix[r][lastColumn] = 0;
    }

    // Adding variable to trackers
    var varIndex = variable.index;
    this.nonBasicIndexes[lastColumn] = varIndex;

    this.rows[varIndex] = -1;
    this.cols[varIndex] = lastColumn;

    this.width += 1;
};


Tableau.prototype.removeVariable = function (variable) {
    var varIndex = variable.index;

    // Putting the variable out of the base
    var c = this._takeOutOfBase(varIndex);

    var lastColumn = this.width - 1;
    if (c !== lastColumn) {
        var lastRow = this.height - 1;
        for (var r = 0; r <= lastRow; r += 1) {
            var row = this.matrix[r];
            var tmp = row[lastColumn];
            row[lastColumn] = row[c];
            row[c] = tmp;
        }

        var switchVarIndex = this.nonBasicIndexes[lastColumn];
        this.nonBasicIndexes[c] = switchVarIndex;
        this.cols[switchVarIndex] = c;
    }

    // Removing variable from non basic variables
    this.nonBasicIndexes[lastColumn] = -1;
    this.cols[varIndex] = -1;

    this.width -= 1;
};

Tableau.prototype._resetMatrix = function () {
    var variables = this.model.variables;
    var constraints = this.model.constraints;

    var nVars = variables.length;
    var nConstraints = constraints.length;

    var v, varIndex;
    var costRow = this.matrix[0];
    if (this.model.isMinimization === true) {
        for (v = 0; v < nVars; v += 1) {
            costRow[v + 1] = -variables[v].cost;
        }
    } else {
        for (v = 0; v < nVars; v += 1) {
            costRow[v + 1] = variables[v].cost;
        }
    }

    for (v = 0; v < nVars; v += 1) {
        varIndex = variables[v].index;
        this.rows[varIndex] = -1;
        this.cols[varIndex] = v + 1;
        this.nonBasicIndexes[v + 1] = varIndex;
    }

    var rowIndex = 1;
    for (var c = 0; c < nConstraints; c += 1) {
        var constraint = constraints[c];

        var constraintIndex = constraint.index;
        this.rows[constraintIndex] = rowIndex;
        this.cols[constraintIndex] = -1;
        this.basicIndexes[rowIndex] = constraintIndex;

        var t, term, column;
        var terms = constraint.terms;
        var nTerms = terms.length;
        var row = this.matrix[rowIndex++];
        if (constraint.isUpperBound) {
            for (t = 0; t < nTerms; t += 1) {
                term = terms[t];
                column = this.cols[term.variable.index];
                row[column] = term.coefficient;
            }

            row[0] = constraint.rhs;
        } else {
            for (t = 0; t < nTerms; t += 1) {
                term = terms[t];
                column = this.cols[term.variable.index];
                row[column] = -term.coefficient;
            }

            row[0] = -constraint.rhs;
        }
    }
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Tableau.prototype.setModel = function (model) {
    this.model = model;

    var width = model.nVariables + 1;
    var height = model.nConstraints + 1;

    this.initialize(width, height, model.variableIds, model.unrestrictedVariables);
    this._resetMatrix();
    return this;
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
        varIndex,
        varName,
        varNameLength,
        nSpaces,
        valueSpace,
        nameSpace;

    var row,
        rowString;

    for (c = 1; c < this.width; c += 1) {
        varIndex = this.nonBasicIndexes[c];
        varName = this.variableIds[varIndex];
        if (varName === undefined) {
            varName = "s" + varIndex;
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
    var firstRow = this.matrix[this.costRowIndex];
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

        varIndex = this.basicIndexes[r];
        varName = this.variableIds[varIndex];
        if (varName === undefined) {
            varName = "s" + varIndex;
        }
        console.log(rowString + " " + varName);
    }
    console.log("");

    return this;
};
