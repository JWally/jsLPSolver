/*global require*/
var Tableau = require("./Tableau.js");
var SlackVariable = require("../expressions.js").SlackVariable;

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
        this.variablesPerIndex[slackVarIndex] = new SlackVariable("s"+slackVarIndex, slackVarIndex);
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
	this.variablesPerIndex[slackVarIndex] = new SlackVariable("s"+slackVarIndex, slackVarIndex);

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
	this.variablesPerIndex[slackVarIndex] = new SlackVariable("s"+slackVarIndex, slackVarIndex);

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
