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
