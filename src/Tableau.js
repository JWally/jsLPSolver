/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/
var Solution = require("./Solution.js");
var expressions = require("./expressions.js");
var Constraint = expressions.Constraint;


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

    this.variablesPerIndex = [];
    this.unrestrictedVars = null;

    // Solution attributes
    this.feasible = true; // until proven guilty
    this.evaluation = 0;

    this.varIndexByRow = null;
    this.varIndexByCol = null;

    this.rowByVarIndex = null;
    this.colByVarIndex = null;

    // this.model.variables[this.varIndexByRow[1]];

        // this.varIndexByRow = null;
        // this.varIndexByCol = null;
        //
        // this.rowByVarIndex = null;
        // this.colByVarIndex = null;

    this.precision = precision || 1e-8;

    this.optionalObjectives = [];
    this.objectivesByPriority = {};

    this.savedState = null;

    this.availableIndexes = [];
    this.lastElementIndex = 0;

    this.variables = null;
    this.nVars = 0;
}
module.exports = Tableau;

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Tableau.prototype.initialize = function (width, height, variables, unrestrictedVars) {
    this.variables = variables;
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

    this.varIndexByRow = new Array(this.height);
    this.varIndexByCol = new Array(this.width);

    this.varIndexByRow[0] = -1;
    this.varIndexByCol[0] = -1;

    this.nVars = width + height - 2;
    this.rowByVarIndex = new Array(this.nVars);
    this.colByVarIndex = new Array(this.nVars);

    this.lastElementIndex = this.nVars;
};

//-------------------------------------------------------------------
// Function: solve
// Detail: Main function, linear programming solver
//-------------------------------------------------------------------
Tableau.prototype.solve = function () {
// this.log('INIT')
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

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Tableau.prototype.updateVariableValues = function () {
    var nVars = this.variables.length;
    var roundingCoeff = Math.round(1 / this.precision);
    for (var v = 0; v < nVars; v += 1) {
        var variable = this.variables[v];
        var varIndex = variable.index;

        var r = this.rowByVarIndex[varIndex];
        if (r === -1) {
            // Variable is non basic
            variable.value = 0;
        } else {
            // Variable is basic
            var varValue = this.matrix[r][this.rhsColumn];
            variable.value = Math.round(varValue * roundingCoeff) / roundingCoeff;
        }
    }
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Tableau.prototype.getSolution = function () {
    var evaluation = (this.model.isMinimization === true) ?
        this.evaluation : -this.evaluation;

    return new Solution(this, evaluation, this.feasible);
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Tableau.prototype.isIntegral = function () {
    var integerVariables = this.model.integerVariables;

    var nIntegerVars = integerVariables.length;
    for (var v = 0; v < nIntegerVars; v++) {
        var varRow = this.rowByVarIndex[integerVariables[v].index];
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
    var biggestFraction = 0;
    var selectedVarIndex = null;
    var selectedVarValue = null;
    var mid = 0.5;

    var integerVariables = this.model.integerVariables;
    var nIntegerVars = integerVariables.length;
    for (var v = 0; v < nIntegerVars; v++) {
        var varIndex = integerVariables[v].index;
        var varRow = this.rowByVarIndex[varIndex];
        if (varRow === -1) {
            continue;
        }

        var varValue = this.matrix[varRow][this.rhsColumn];
        var fraction = Math.abs(varValue - Math.round(varValue));
        if (biggestFraction < fraction) {
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
        var varRow = this.rowByVarIndex[varIndex];
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
            unrestricted = this.unrestrictedVars[this.varIndexByRow[r]] === true;
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
            var reducedCost = leavingRow[c];
            if (-this.precision < reducedCost && reducedCost < this.precision) {
                continue;
            }

            unrestricted = this.unrestrictedVars[this.varIndexByCol[c]] === true;
            if (unrestricted || reducedCost < -this.precision) {
                var quotient = -costRow[c] / reducedCost;
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

        // console.log("=========phase1=========");
        // console.log(leavingRowIndex, enteringColumn);
        // console.log("==================");
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
    var nOptionalObjectives = this.optionalObjectives.length;
    var optionalCostsColumns = null;

    var iterations = 0;
    var reducedCost, unrestricted;
    while (true) {
        var costRow = matrix[this.costRowIndex];

        // Selecting entering variable (optimality condition)
        if (nOptionalObjectives > 0) {
            optionalCostsColumns = [];
        }

        var enteringColumn = 0;
        var enteringValue = this.precision;
        var isReducedCostNegative = false;
        for (var c = 1; c <= lastColumn; c++) {
            reducedCost = costRow[c];
            unrestricted = this.unrestrictedVars[this.varIndexByCol[c]] === true;

            if (nOptionalObjectives > 0 && -this.precision < reducedCost && reducedCost < this.precision) {
                optionalCostsColumns.push(c);
                continue;
            }

            if (unrestricted && reducedCost < 0) {
                if (-reducedCost > enteringValue) {
                    enteringValue = -reducedCost;
                    enteringColumn = c;
                    isReducedCostNegative = true;
                }
                continue;
            }

            if (reducedCost > enteringValue) {
                enteringValue = reducedCost;
                enteringColumn = c;
                isReducedCostNegative = false;
            }
        }

        if (nOptionalObjectives > 0) {
            // There exist optional improvable objectives
            var o = 0;
            while (enteringColumn === 0 && optionalCostsColumns.length > 0 && o < nOptionalObjectives) {
                var optionalCostsColumns2 = [];
                var reducedCosts = this.optionalObjectives[o].reducedCosts;
                for (var i = 0; i <= optionalCostsColumns.length; i++) {
                    c = optionalCostsColumns[i];
                    reducedCost = reducedCosts[c];
                    unrestricted = this.unrestrictedVars[this.varIndexByCol[c]] === true;

                    if (-this.precision < reducedCost && reducedCost < this.precision) {
                        optionalCostsColumns2.push(c);
                        continue;
                    }

                    if (unrestricted && reducedCost < 0) {
                        if (-reducedCost > enteringValue) {
                            enteringValue = -reducedCost;
                            enteringColumn = c;
                            isReducedCostNegative = true;
                        }
                        continue;
                    }

                    if (reducedCost > enteringValue) {
                        enteringValue = reducedCost;
                        enteringColumn = c;
                        isReducedCostNegative = false;
                    }
                }
                optionalCostsColumns = optionalCostsColumns2;
                o += 1;
            }
        }

        // If no entering column could be found we're done with phase 2.
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

            var quotient = isReducedCostNegative ? -rhsValue / colValue : rhsValue / colValue;
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

        // console.log("=========phase2=========");
        // console.log(leavingRow, enteringColumn);
        // console.log("==================");
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
Tableau.prototype.pivot = function (pivotRowIndex, pivotColumnIndex) {
    var matrix = this.matrix;

// console.log("=========pivot=========");
// console.log("matrix ", matrix);
// console.log("pivotRowIndex", pivotRowIndex);
// console.log("pivotColumnIndex", pivotColumnIndex);
// console.log("=======================");
    var quotient = matrix[pivotRowIndex][pivotColumnIndex];

    var lastRow = this.height - 1;
    var lastColumn = this.width - 1;

    var leavingBasicIndex = this.varIndexByRow[pivotRowIndex];
    var enteringBasicIndex = this.varIndexByCol[pivotColumnIndex];
    // console.log("pivot1 ", pivotRowIndex, leavingBasicIndex, this.varIndexByRow);
    // console.log("pivot2 ", pivotColumnIndex, enteringBasicIndex, this.varIndexByCol);

    this.varIndexByRow[pivotRowIndex] = enteringBasicIndex;
    this.varIndexByCol[pivotColumnIndex] = leavingBasicIndex;

    this.rowByVarIndex[enteringBasicIndex] = pivotRowIndex;
    this.rowByVarIndex[leavingBasicIndex] = -1;

    this.colByVarIndex[enteringBasicIndex] = -1;
    this.colByVarIndex[leavingBasicIndex] = pivotColumnIndex;

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
    var coefficient, i, v0;
    var precision = this.precision;
    for (var r = 0; r <= lastRow; r++) {
        var row = matrix[r];
        if (r !== pivotRowIndex) {
            coefficient = row[pivotColumnIndex];
            // No point Burning Cycles if
            // Zero to the thing
            if (coefficient !== 0) {
                for (i = 0; i < nNonZeroColumns; i++) {
                    c = nonZeroColumns[i];
                    // No point in doing math if you're just adding
                    // Zero to the thing
                    v0 = pivotRow[c];
                    if (v0 !== 0) {
                        row[c] = row[c] - coefficient * v0;
                    }
                }

                row[pivotColumnIndex] = -coefficient / quotient;
            }
        }
    }

    var nOptionalObjectives = this.optionalObjectives.length;
    if (nOptionalObjectives > 0) {
        for (var o = 0; o < nOptionalObjectives; o += 1) {
            var reducedCosts = this.optionalObjectives[o].reducedCosts;
            coefficient = reducedCosts[pivotColumnIndex];
            if (coefficient !== 0) {
                for (i = 0; i < nNonZeroColumns; i++) {
                    c = nonZeroColumns[i];
                    v0 = pivotRow[c];
                    if (v0 !== 0) {
                        reducedCosts[c] = reducedCosts[c] - coefficient * v0;
                    }
                }

                reducedCosts[pivotColumnIndex] = -coefficient / quotient;
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
    copy.variables = this.variables;
    copy.variablesPerIndex = this.variablesPerIndex;
    copy.unrestrictedVars = this.unrestrictedVars;
    copy.lastElementIndex = this.lastElementIndex;

    // All the other arrays are deep copied
    copy.varIndexByRow = this.varIndexByRow.slice();
    copy.varIndexByCol = this.varIndexByCol.slice();

    copy.rowByVarIndex = this.rowByVarIndex.slice();
    copy.colByVarIndex = this.colByVarIndex.slice();

    copy.availableIndexes = this.availableIndexes.slice();


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
        return;
    }

    var save = this.savedState;
    var savedMatrix = save.matrix;
    this.nVars = save.nVars;
    this.model = save.model;

    // Shallow restore
    this.variables = save.variables;
    this.variablesPerIndex = save.variablesPerIndex;
    this.unrestrictedVars = save.unrestrictedVars;
    this.lastElementIndex = save.lastElementIndex;

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
    var savedBasicIndexes = save.varIndexByRow;
    for (c = 0; c < this.height; c += 1) {
        this.varIndexByRow[c] = savedBasicIndexes[c];
    }

    while (this.varIndexByRow.length > this.height) {
        this.varIndexByRow.pop();
    }

    var savedNonBasicIndexes = save.varIndexByCol;
    for (r = 0; r < this.width; r += 1) {
        this.varIndexByCol[r] = savedNonBasicIndexes[r];
    }

    while (this.varIndexByCol.length > this.width) {
        this.varIndexByCol.pop();
    }

    var savedRows = save.rowByVarIndex;
    var savedCols = save.colByVarIndex;
    for (var v = 0; v < this.nVars; v += 1) {
        this.rowByVarIndex[v] = savedRows[v];
        this.colByVarIndex[v] = savedCols[v];
    }

    this.availableIndexes = save.availableIndexes.slice();
};

Tableau.prototype.addCutConstraints = function (cutConstraints) {
    var nCutConstraints = cutConstraints.length;

    var height = this.height;
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
        var varRowIndex = this.rowByVarIndex[varIndex];
        var constraintRow = this.matrix[r];
        if (varRowIndex === -1) {
            // Variable is non basic
            constraintRow[this.rhsColumn] = sign * cut.value;
            for (c = 1; c <= lastColumn; c += 1) {
                constraintRow[c] = 0;
            }
            constraintRow[this.colByVarIndex[varIndex]] = sign;
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
        var slackVarIndex = this.getNewElementIndex();
        this.varIndexByRow[r] = slackVarIndex;
        this.rowByVarIndex[slackVarIndex] = r;
        this.colByVarIndex[slackVarIndex] = -1;
        this.variablesPerIndex[slackVarIndex] = new expressions.SlackVariable("s"+slackVarIndex, slackVarIndex);
        this.nVars += 1;
    }
};

Tableau.prototype._addLowerBoundMIRCut = function(rowIndex) {
    
	if(rowIndex === this.costRowIndex) {
		//console.log("! IN MIR CUTS : The index of the row corresponds to the cost row. !");
		return false;
	}

	var model = this.model;
	var matrix = this.matrix;

	var intVar = this.variablesPerIndex[this.varIndexByRow[rowIndex]];
	if (!intVar.isInteger) {
		return false;
    }

	var d = matrix[rowIndex][this.rhsColumn];
	var frac_d = d - Math.floor(d);

	if (frac_d < this.precision || 1 - this.precision < frac_d) {
		return false;
    }

	//Adding a row
	var r = this.height;
	matrix[r] = matrix[r - 1].slice();
	this.height += 1;

	// Creating slack variable
	this.nVars += 1;
	var slackVarIndex = this.getNewElementIndex();
	this.varIndexByRow[r] = slackVarIndex;
	this.rowByVarIndex[slackVarIndex] = r;
	this.colByVarIndex[slackVarIndex] = -1;
	this.variablesPerIndex[slackVarIndex] = new expressions.SlackVariable("s"+slackVarIndex, slackVarIndex);

	matrix[r][this.rhsColumn] = Math.floor(d);

	for (var colIndex = 1; colIndex < this.varIndexByCol.length; colIndex += 1) {
		var variable = this.variablesPerIndex[this.varIndexByCol[colIndex]];

		if (!variable.isInteger) {
			matrix[r][colIndex] = Math.min(0, matrix[rowIndex][colIndex] / (1 - frac_d));
		} else {
			var coef = matrix[rowIndex][colIndex];
			var termCoeff = Math.floor(coef)+Math.max(0, coef - Math.floor(coef) - frac_d) / (1 - frac_d);
			matrix[r][colIndex] = termCoeff;
		}
	}

	for(var c = 0; c < this.width; c += 1) {
		matrix[r][c] -= matrix[rowIndex][c];
	}

	return true;
};

Tableau.prototype._addUpperBoundMIRCut = function(rowIndex) {

	if (rowIndex === this.costRowIndex) {
		//console.log("! IN MIR CUTS : The index of the row corresponds to the cost row. !");
		return false;
	}

	var model = this.model;
	var matrix = this.matrix;

	var intVar = this.variablesPerIndex[this.varIndexByRow[rowIndex]];
	if (!intVar.isInteger) {
		return false;
    }

	var b = matrix[rowIndex][this.rhsColumn];
	var f = b - Math.floor(b);

	if (f < this.precision || 1 - this.precision < f) {
		return false;
    }

	//Adding a row
	var r = this.height;
	matrix[r] = matrix[r - 1].slice();
	this.height += 1;

	// Creating slack variable
	this.nVars += 1;
	var slackVarIndex = this.getNewElementIndex();
	this.varIndexByRow[r] = slackVarIndex;
	this.rowByVarIndex[slackVarIndex] = r;
	this.colByVarIndex[slackVarIndex] = -1;
	this.variablesPerIndex[slackVarIndex] = new expressions.SlackVariable("s"+slackVarIndex, slackVarIndex);

	matrix[r][this.rhsColumn] = -f;

	for(var colIndex = 1; colIndex < this.varIndexByCol.length; colIndex += 1) {
		var variable = this.variablesPerIndex[this.varIndexByCol[colIndex]];

		var aj = matrix[rowIndex][colIndex];
		var fj = aj - Math.floor(aj);

		if(variable.isInteger) {
			if(fj <= f) {
				matrix[r][colIndex] = -fj;
            } else {
				matrix[r][colIndex] = -(1 - fj) * f / fj;
            }
		} else {
			if (aj >= 0) {
				matrix[r][colIndex] = -aj;
            } else {
				matrix[r][colIndex] = aj * f / (1 - f);
            }
		}
	}

	return true;
};

Tableau.prototype.applyMIRCuts = function () {

    var nRows = this.height;
    for (var cst = 0; cst < nRows; cst += 1) {
        this._addUpperBoundMIRCut(cst);
    }

    // nRows = tableau.height;
    for (cst = 0; cst < nRows; cst += 1) {
        this._addLowerBoundMIRCut(cst);
    }
};

Tableau.prototype.countIntegerValues = function(){

    var count = 0;

    for (var r = 1; r < this.height; r += 1) {
        if (this.variablesPerIndex[this.varIndexByRow[r]].isInteger) {
            var decimalPart = this.matrix[r][this.rhsColumn];
            decimalPart = decimalPart - Math.floor(decimalPart);
            if (decimalPart < this.precision && -decimalPart < this.precision) {
                count += 1;
            }
        }
    }

    return count;
};

// Multiply all the fractional parts of variables supposed to be integer
Tableau.prototype.computeFractionalVolume = function(ignoreIntegerValues) {

    var volume = -1;

    for (var r = 1; r < this.height; r += 1) {
        if (this.variablesPerIndex[this.varIndexByRow[r]].isInteger) {
            var rhs = this.matrix[r][this.rhsColumn];
            rhs = Math.abs(rhs);
            var decimalPart = Math.min(rhs - Math.floor(rhs), Math.floor(rhs + 1));
            if (decimalPart < this.precision) {
                if (!ignoreIntegerValues) {
                    return 0;
                }
            } else {
                if (volume === -1) {
                    volume = rhs;
                } else {
                    volume *= rhs;
                }
            }
        }
    }

    if (volume === -1){
        return 0;
    }
    return volume;
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
    var r = this.rowByVarIndex[varIndex];

    if (r === -1) {
        // Outside the base
        // pivoting to take it out
        var c = this.colByVarIndex[varIndex];

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
    var c = this.colByVarIndex[varIndex];
    if (c === -1) {
        // Inside the base
        // pivoting to take it out
        var r = this.rowByVarIndex[varIndex];

        // Selecting pivot column
        // (Any column with coefficient different from 0)
        var pivotRow = this.matrix[r];
        for (var c1 = 1; c1 < this.width; c1 += 1) {
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
    var constraintRow = this.rowByVarIndex[constraint.index];
    if (constraintRow === -1) {
        // Slack is not in base
        var slackColumn = this.colByVarIndex[constraint.index];

        // Upading all the RHS values
        for (var r = 0; r <= lastRow; r += 1) {
            var row = this.matrix[r];
            row[this.rhsColumn] -= difference * row[slackColumn];
        }

        var nOptionalObjectives = this.optionalObjectives.length;
        if (nOptionalObjectives > 0) {
            for (var o = 0; o < nOptionalObjectives; o += 1) {
                var reducedCosts = this.optionalObjectives[o].reducedCosts;
                reducedCosts[this.rhsColumn] -= difference * reducedCosts[slackColumn];
            }
        }
    } else {
        // Slack variable of constraint is in base
        // Updating RHS with the difference between the old and the new one
        this.matrix[constraintRow][this.rhsColumn] -= difference;
    }
};

Tableau.prototype.updateConstraintCoefficient = function (constraint, variable, difference) {

    // Updates variable coefficient within a constraint
    if (constraint.index === variable.index) {
        // console.log('constraint index is', constraint.index);
        throw new Error("In tableau.updateConstraintCoefficient : constraint index = variable index !");
    }

    var r = this._putInBase(constraint.index);

    var colVar = this.colByVarIndex[variable.index];
    if (colVar === -1) {
        var rowVar = this.rowByVarIndex[variable.index];
        for (var c = 0; c < this.width; c += 1){
            this.matrix[r][c] -= difference * this.matrix[rowVar][c];
        }
    } else {
        this.matrix[r][colVar] -= difference;
    }
};

Tableau.prototype.updateCost = function (variable, difference) {
    // Updates variable coefficient within the objective function
    var varIndex = variable.index;
    var lastColumn = this.width - 1;
    var varColumn = this.colByVarIndex[varIndex];
    if (varColumn === -1) {
        // Variable is in base
        var variableRow = this.matrix[this.rowByVarIndex[varIndex]];

        var c;
        if (variable.priority === 0) {
            var costRow = this.matrix[0];

            // Upading all the reduced costs
            for (c = 0; c <= lastColumn; c += 1) {
                costRow[c] += difference * variableRow[c];
            }
        } else {
            var reducedCosts = this.objectivesByPriority[variable.priority].reducedCosts;
            for (c = 0; c <= lastColumn; c += 1) {
                reducedCosts[c] += difference * variableRow[c];
            }
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

        var varRowIndex = this.rowByVarIndex[varIndex];
        if (varRowIndex === -1) {
            // Variable is non basic
            constraintRow[this.colByVarIndex[varIndex]] += sign * coefficient;
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
    this.varIndexByRow[lastRow] = slackIndex;
    this.rowByVarIndex[slackIndex] = lastRow;
    this.colByVarIndex[slackIndex] = -1;

    this.height += 1;
};

Tableau.prototype.removeConstraint = function (constraint) {
    var slackIndex = constraint.index;
    var lastRow = this.height - 1;

    // Putting the constraint's slack in the base
    var r = this._putInBase(slackIndex);

    // Removing constraint
    // by putting the corresponding row at the bottom of the matrix
    // and virtually reducing the height of the matrix by 1
    var tmpRow = this.matrix[lastRow];
    this.matrix[lastRow] = this.matrix[r];
    this.matrix[r] = tmpRow;

    // Removing associated slack variable from basic variables
    this.varIndexByRow[r] = this.varIndexByRow[lastRow];
    this.varIndexByRow[lastRow] = -1;
    this.rowByVarIndex[slackIndex] = -1;

    // Putting associated slack variable index in index manager
    this.availableIndexes[this.availableIndexes.length] = slackIndex;

    this.height -= 1;
};

function OptionalObjective(priority, nColumns) {
    this.priority = priority;
    this.reducedCosts = new Array(nColumns);
    for (var c = 0; c < nColumns; c += 1) {
        this.reducedCosts[c] = 0;
    }
}

Tableau.prototype.setOptionalObjective = function (priority, column, cost) {
    var objectiveForPriority = this.objectivesByPriority[priority];
    if (objectiveForPriority === undefined) {
        var nColumns = Math.max(this.width, column) + 1;
        objectiveForPriority = new OptionalObjective(priority, nColumns);
        this.objectivesByPriority[priority] = objectiveForPriority;
        this.optionalObjectives.push(objectiveForPriority);
        this.optionalObjectives.sort(function (a, b) {
            return a.priority - b.priority;
        });
    }

    objectiveForPriority.reducedCosts[column] = cost;
};

Tableau.prototype.addVariable = function (variable) {
    // Adds a variable to the tableau
    // var sign = constraint.isUpperBound ? 1 : -1;

    var lastRow = this.height - 1;
    var lastColumn = this.width;
    var cost = this.model.isMinimization === true ? -variable.cost : variable.cost;
    var priority = variable.priority;

    // Setting reduced costs
    var nOptionalObjectives = this.optionalObjectives.length;
    if (nOptionalObjectives > 0) {
        for (var o = 0; o < nOptionalObjectives; o += 1) {
            this.optionalObjectives[o].reducedCosts[lastColumn] = 0;
        }
    }

    if (priority === 0) {
        this.matrix[0][lastColumn] = cost;
    } else {
        this.setOptionalObjective(priority, lastColumn, cost);
        this.matrix[0][lastColumn] = 0;
    }

    // Setting all other column cells to 0
    for (var r = 1; r <= lastRow; r += 1) {
        this.matrix[r][lastColumn] = 0;
    }

    // Adding variable to trackers
    var varIndex = variable.index;
    this.varIndexByCol[lastColumn] = varIndex;

    this.rowByVarIndex[varIndex] = -1;
    this.colByVarIndex[varIndex] = lastColumn;

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
            row[c] = row[lastColumn];
        }

        var nOptionalObjectives = this.optionalObjectives.length;
        if (nOptionalObjectives > 0) {
            for (var o = 0; o < nOptionalObjectives; o += 1) {
                var reducedCosts = this.optionalObjectives[o].reducedCosts;
                reducedCosts[c] = reducedCosts[lastColumn];
            }
        }

        var switchVarIndex = this.varIndexByCol[lastColumn];
        this.varIndexByCol[c] = switchVarIndex;
        this.colByVarIndex[switchVarIndex] = c;
    }

    // Removing variable from non basic variables
    this.varIndexByCol[lastColumn] = -1;
    this.colByVarIndex[varIndex] = -1;

    // Adding index into index manager
    this.availableIndexes[this.availableIndexes.length] = varIndex;

    this.width -= 1;
};

Tableau.prototype._resetMatrix = function () {
    var variables = this.model.variables;
    var constraints = this.model.constraints;

    var nVars = variables.length;
    var nConstraints = constraints.length;

    var v, varIndex;
    var costRow = this.matrix[0];
    var coeff = (this.model.isMinimization === true) ? -1 : 1;
    for (v = 0; v < nVars; v += 1) {
        var variable = variables[v];
        var priority = variable.priority;
        var cost = coeff * variable.cost;
        if (priority === 0) {
            costRow[v + 1] = cost;
        } else {
            this.setOptionalObjective(priority, v + 1, cost);
        }
    }

    for (v = 0; v < nVars; v += 1) {
        varIndex = variables[v].index;
        this.rowByVarIndex[varIndex] = -1;
        this.colByVarIndex[varIndex] = v + 1;
        this.varIndexByCol[v + 1] = varIndex;
    }

    var rowIndex = 1;
    for (var c = 0; c < nConstraints; c += 1) {
        var constraint = constraints[c];

        var constraintIndex = constraint.index;
        this.rowByVarIndex[constraintIndex] = rowIndex;
        this.colByVarIndex[constraintIndex] = -1;
        this.varIndexByRow[rowIndex] = constraintIndex;

        var t, term, column;
        var terms = constraint.terms;
        var nTerms = terms.length;
        var row = this.matrix[rowIndex++];
        if (constraint.isUpperBound) {
            for (t = 0; t < nTerms; t += 1) {
                term = terms[t];
                column = this.colByVarIndex[term.variable.index];
                row[column] = term.coefficient;
            }

            row[0] = constraint.rhs;
        } else {
            for (t = 0; t < nTerms; t += 1) {
                term = terms[t];
                column = this.colByVarIndex[term.variable.index];
                row[column] = -term.coefficient;
            }

            row[0] = -constraint.rhs;
        }
    }
};


Tableau.prototype.getNewElementIndex = function () {
    if (this.availableIndexes.length > 0) {
        return this.availableIndexes.pop();
    }

    var index = this.lastElementIndex;
    this.lastElementIndex += 1;
    return index;
};


//-------------------------------------------------------------------
//-------------------------------------------------------------------
Tableau.prototype.setModel = function (model) {
    this.model = model;

    var width = model.nVariables + 1;
    var height = model.nConstraints + 1;


    this.initialize(width, height, model.variables, model.unrestrictedVariables);
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
    // console.log("Variable Ids", this.variablesPerIndex);
    console.log("Basic Indexes", this.varIndexByRow);
    console.log("Non Basic Indexes", this.varIndexByCol);
    console.log("Rows", this.rowByVarIndex);
    console.log("Cols", this.colByVarIndex);

    var digitPrecision = 5;

    // Variable declaration
    var varNameRowString = "",
        spacePerColumn = [" "],
        j,
        c,
        s,
        r,
        variable,
        varIndex,
        varName,
        varNameLength,
        nSpaces,
        valueSpace,
        nameSpace;

    var row,
        rowString;

    for (c = 1; c < this.width; c += 1) {
        varIndex = this.varIndexByCol[c];
        variable = this.variablesPerIndex[varIndex];
        if (variable === undefined) {
            varName = "c" + varIndex;
        } else {
            varName = variable.id;
        }

        varNameLength = varName.length;
        nSpaces = Math.abs(varNameLength - 5);
        valueSpace = " ";
        nameSpace = "\t";

        ///////////
        /*valueSpace = " ";
        nameSpace = " ";

        for (s = 0; s < nSpaces; s += 1) {
            if (varNameLength > 5) {
                valueSpace += " ";
            } else {
                nameSpace += " ";
            }
        }*/

        ///////////
        if (varNameLength > 5) {
            valueSpace += " ";
        } else {
            nameSpace += "\t";
        }

        spacePerColumn[c] = valueSpace;

        varNameRowString += nameSpace + varName;
    }
    console.log(varNameRowString);

    var signSpace;

    // Displaying reduced costs
    var firstRow = this.matrix[this.costRowIndex];
    var firstRowString = "\t";

    ///////////
    /*for (j = 1; j < this.width; j += 1) {
        signSpace = firstRow[j] < 0 ? "" : " ";
        firstRowString += signSpace;
        firstRowString += spacePerColumn[j];
        firstRowString += firstRow[j].toFixed(2);
    }
    signSpace = firstRow[0] < 0 ? "" : " ";
    firstRowString += signSpace + spacePerColumn[0] +
        firstRow[0].toFixed(2);
    console.log(firstRowString + " Z");*/

    ///////////
    for (j = 1; j < this.width; j += 1) {
        signSpace = "\t";
        firstRowString += signSpace;
        firstRowString += spacePerColumn[j];
        firstRowString += firstRow[j].toFixed(digitPrecision);
    }
    signSpace = "\t";
    firstRowString += signSpace + spacePerColumn[0] +
        firstRow[0].toFixed(digitPrecision);
    console.log(firstRowString + "\tZ");


    // Then the basic variable rowByVarIndex
    for (r = 1; r < this.height; r += 1) {
        row = this.matrix[r];
        rowString = "\t";

        ///////////
        /*for (c = 1; c < this.width; c += 1) {
            signSpace = row[c] < 0 ? "" : " ";
            rowString += signSpace + spacePerColumn[c] + row[c].toFixed(2);
        }
        signSpace = row[0] < 0 ? "" : " ";
        rowString += signSpace + spacePerColumn[0] + row[0].toFixed(2);*/

        ///////////
        for (c = 1; c < this.width; c += 1) {
            signSpace = "\t";
            rowString += signSpace + spacePerColumn[c] + row[c].toFixed(digitPrecision);
        }
        signSpace = "\t";
        rowString += signSpace + spacePerColumn[0] + row[0].toFixed(digitPrecision);


        varIndex = this.varIndexByRow[r];
        variable = this.variablesPerIndex[varIndex];
        if (variable === undefined) {
            varName = "c" + varIndex;
        } else {
            varName = variable.id;
        }
        console.log(rowString + "\t" + varName);
    }
    console.log("");

    // Then reduced costs for optional objectives
    var nOptionalObjectives = this.optionalObjectives.length;
    if (nOptionalObjectives > 0) {
        console.log("    Optional objectives:");
        for (var o = 0; o < nOptionalObjectives; o += 1) {
            var reducedCosts = this.optionalObjectives[o].reducedCosts;
            var reducedCostsString = "";
            for (j = 1; j < this.width; j += 1) {
                signSpace = reducedCosts[j] < 0 ? "" : " ";
                reducedCostsString += signSpace;
                reducedCostsString += spacePerColumn[j];
                reducedCostsString += reducedCosts[j].toFixed(digitPrecision);
            }
            signSpace = reducedCosts[0] < 0 ? "" : " ";
            reducedCostsString += signSpace + spacePerColumn[0] +
                reducedCosts[0].toFixed(digitPrecision);
            console.log(reducedCostsString + " z" + o);
        }
    }
    console.log("Feasible?", this.feasible);
    console.log("evaluation", this.evaluation);

    return this;
};
