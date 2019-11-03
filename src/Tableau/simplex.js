/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/

var Tableau = require("./Tableau.js");

//-------------------------------------------------------------------
// Function: solve
// Detail: Main function, linear programming solver
//-------------------------------------------------------------------
Tableau.prototype.simplex = function () {
    // Bounded until proven otherwise
    this.bounded = true;

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
// Description: Convert a non standard form tableau
//              to a standard form tableau by eliminating
//              all negative values in the Right Hand Side (RHS)
//              This results in a Basic Feasible Solution (BFS)
//
//-------------------------------------------------------------------
Tableau.prototype.phase1 = function () {
    var debugCheckForCycles = this.model.checkForCycles;
    var varIndexesCycle = [];

    var matrix = this.matrix;
    var rhsColumn = this.rhsColumn;
    var lastColumn = this.width - 1;
    var lastRow = this.height - 1;

    var unrestricted;
    var iterations = 0;

    while (true) {
        // ******************************************
        // ** PHASE 1 - STEP  1 : FIND PIVOT ROW **
        //
        // Selecting leaving variable (feasibility condition):
        // Basic variable with most negative value
        //
        // ******************************************
        var leavingRowIndex = 0;
        var rhsValue = -this.precision;
        for (var r = 1; r <= lastRow; r++) {
            unrestricted = this.unrestrictedVars[this.varIndexByRow[r]] === true;
            
            //
            // *Don't think this does anything...
            //
            //if (unrestricted) {
            //    continue;
            //}

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


        // ******************************************
        // ** PHASE 1 - STEP  2 : FIND PIVOT COLUMN **
        //
        //
        // ******************************************
        // Selecting entering variable
        var enteringColumn = 0;
        var maxQuotient = -Infinity;
        var costRow = matrix[0];
        var leavingRow = matrix[leavingRowIndex];
        for (var c = 1; c <= lastColumn; c++) {
            var coefficient = leavingRow[c];
            //
            // *Don't think this does anything...
            //
            //if (-this.precision < coefficient && coefficient < this.precision) {
            //    continue;
            //}
            //

            unrestricted = this.unrestrictedVars[this.varIndexByCol[c]] === true;
            if (unrestricted || coefficient < -this.precision) {
                var quotient = -costRow[c] / coefficient;
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

        if(debugCheckForCycles){
            varIndexesCycle.push([this.varIndexByRow[leavingRowIndex], this.varIndexByCol[enteringColumn]]);

            var cycleData = this.checkForCycles(varIndexesCycle);
            if(cycleData.length > 0){

                this.model.messages.push("Cycle in phase 1");
                this.model.messages.push("Start :"+ cycleData[0]);
                this.model.messages.push("Length :"+ cycleData[1]);

                this.feasible = false;
                return iterations;
                
            }
        }

        this.pivot(leavingRowIndex, enteringColumn);
        iterations += 1;
    }
};

//-------------------------------------------------------------------
// Description: Apply simplex to obtain optimal solution
//              used as phase2 of the simplex
//
//-------------------------------------------------------------------
Tableau.prototype.phase2 = function () {
    var debugCheckForCycles = this.model.checkForCycles;
    var varIndexesCycle = [];

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
        var enteringValue = precision;
        var isReducedCostNegative = false;
        for (var c = 1; c <= lastColumn; c++) {
            reducedCost = costRow[c];
            unrestricted = this.unrestrictedVars[this.varIndexByCol[c]] === true;

            if (nOptionalObjectives > 0 && -precision < reducedCost && reducedCost < precision) {
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

                enteringValue = precision;

                for (var i = 0; i < optionalCostsColumns.length; i++) {
                    c = optionalCostsColumns[i];

                    reducedCost = reducedCosts[c];
                    unrestricted = this.unrestrictedVars[this.varIndexByCol[c]] === true;

                    if (-precision < reducedCost && reducedCost < precision) {
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
            this.simplexIters += 1;
            return iterations;
        }

        // Selecting leaving variable
        var leavingRow = 0;
        var minQuotient = Infinity;

        var varIndexByRow = this.varIndexByRow;

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
            if (quotient > precision && minQuotient > quotient) {
                minQuotient = quotient;
                leavingRow = r;
            }
        }

        if (minQuotient === Infinity) {
            // optimal value is -Infinity
            this.evaluation = -Infinity;
            this.bounded = false;
            this.unboundedVarIndex = this.varIndexByCol[enteringColumn];
            return iterations;
        }

        if(debugCheckForCycles){
            varIndexesCycle.push([this.varIndexByRow[leavingRow], this.varIndexByCol[enteringColumn]]);

            var cycleData = this.checkForCycles(varIndexesCycle);
            if(cycleData.length > 0){

                this.model.messages.push("Cycle in phase 2");
                this.model.messages.push("Start :"+ cycleData[0]);
                this.model.messages.push("Length :"+ cycleData[1]);

                this.feasible = false;
                return iterations;
            }
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
Tableau.prototype.pivot = function (pivotRowIndex, pivotColumnIndex) {
    var matrix = this.matrix;

    var quotient = matrix[pivotRowIndex][pivotColumnIndex];

    var lastRow = this.height - 1;
    var lastColumn = this.width - 1;

    var leavingBasicIndex = this.varIndexByRow[pivotRowIndex];
    var enteringBasicIndex = this.varIndexByCol[pivotColumnIndex];

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
        if (!(pivotRow[c] >= -1e-16 && pivotRow[c] <= 1e-16)) {
            pivotRow[c] /= quotient;
            nonZeroColumns[nNonZeroColumns] = c;
            nNonZeroColumns += 1;
        } else {
            pivotRow[c] = 0;
        }
    }
    pivotRow[pivotColumnIndex] = 1 / quotient;

    // for every row EXCEPT the pivot row,
    // set the value in the pivot column = 0 by
    // multiplying the value of all elements in the objective
    // row by ... yuck... just look below; better explanation later
    var coefficient, i, v0;
    var precision = this.precision;
    
    // //////////////////////////////////////
    //
    // This is step 2 of the pivot function.
    // It is, by far, the most expensive piece of
    // this whole process where the code can be optimized (faster code)
    // without changing the whole algorithm (fewer cycles)
    //
    // 1.) For every row but the pivot row
    // 2.) Update each column to 
    //    a.) itself
    //        less
    //    b.) active-row's pivot column
    //        times
    //    c.) whatever-the-hell this is: nonZeroColumns[i]
    // 
    // //////////////////////////////////////
    // console.time("step-2");
    for (var r = 0; r <= lastRow; r++) {
        if (r !== pivotRowIndex) {
            //if(1 === 1){
            if(!(matrix[r][pivotColumnIndex] >= -1e-16 && matrix[r][pivotColumnIndex] <= 1e-16)){
            //if((matrix[r][pivotColumnIndex] !== 0)){
                // Set reference to the row we're working on
                //
                var row = matrix[r];

                // Catch the coefficient that we're going to end up dividing everything by
                coefficient = row[pivotColumnIndex];
                
                // No point Burning Cycles if
                // Zero to the thing
                if (!(coefficient >= -1e-16 && coefficient <= 1e-16)) {
                    for (i = 0; i < nNonZeroColumns; i++) {
                        c = nonZeroColumns[i];
                        // No point in doing math if you're just adding
                        // Zero to the thing
                        v0 = pivotRow[c];
                        if (!(v0 >= -1e-16 && v0 <= 1e-16)) {
                            row[c] = row[c] - coefficient * v0;
                        } else {
                            if(v0 !== 0){
                                pivotRow[c] = 0;
                            }
                        }
                    }

                    row[pivotColumnIndex] = -coefficient / quotient;
                } else {
                    if(coefficient !== 0){
                        row[pivotColumnIndex] = 0;
                    }
                }
            }
        }
    }
    // console.timeEnd("step-2");

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



Tableau.prototype.checkForCycles = function (varIndexes) {
    for (var e1 = 0; e1 < varIndexes.length - 1; e1++) {
        for (var e2 = e1 + 1; e2 < varIndexes.length; e2++) {
            var elt1 = varIndexes[e1];
            var elt2 = varIndexes[e2];
            if (elt1[0] === elt2[0] && elt1[1] === elt2[1]) {
                if (e2 - e1 > varIndexes.length - e2) {
                    break;
                }
                var cycleFound = true;
                for (var i = 1; i < e2 - e1; i++) {
                    var tmp1 = varIndexes[e1+i];
                    var tmp2 = varIndexes[e2+i];
                    if(tmp1[0] !== tmp2[0] || tmp1[1] !== tmp2[1]) {
                        cycleFound = false;
                        break;
                    }
                }
                if (cycleFound) {
                    return [e1, e2 - e1];
                }
            }
        }
    }
    return [];
};
