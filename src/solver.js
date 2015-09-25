//-------------------------------------------------------------------
// SimplexJS
// https://github.com/
// An Object-Oriented Linear Programming Solver
//
// By Justin Wolcott (c)
// Licensed under the MIT License.
//-------------------------------------------------------------------


/*global describe*/
/*global require*/
/*global it*/
/*global console*/
/*global process*/

// Place everything under the Solver Name Space
var Solver = function () {

    "use strict";
    //-------------------------------------------------------------------
    // I'm putting an object inside of this function to house
    // all private methods
    //-------------------------------------------------------------------
    var obj = {};

    /*************************************************************
     * Class: Tableau
     * Description: Simplex tableau, holding a the tableau matrix
     *              and all the information necessary to perform
     *              the simplex algorithm
     * Agruments:
     *        precision: If we're solving a MILP, how tight
     *                   do we want to define an integer, given
     *                   that 20.000000000000001 is not an integer.
     *                   (defaults to 1e-9)
     **************************************************************/
    function Tableau(precision) {
        this.optimizationType = 'min'; // or 'max'

        this.matrix = null;
        this.width  = 0;
        this.height = 0;

        this.nObjectiveVars = 0;
        this.nSlackVars = 0;

        this.feasbilityRowIndex = 0;
        this.objectiveRowIndex = 1;
        this.rhsColumn = 0;

        this.variableIds = null;

        this.integerIndexes = [];

        // Solution attributes
        this.feasible = true; // until proven guilty
        this.solutionSet = {};
        this.objectiveValue = 0;

        this.basicIndexes    = null;
        this.nonBasicIndexes = null;

        this.rows = null;
        this.cols = null;

        this.precision = precision || 1e-9;
    }
    //-------------------------------------------------------------------
    //-------------------------------------------------------------------
    Tableau.prototype.initialize = function (width, height, variableIds, nObjectiveVars, nSlackVars) {
        this.variableIds = variableIds;

        this.nObjectiveVars = nObjectiveVars;
        this.nSlackVars     = nSlackVars;

        this.width  = width;
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
        this.basicIndexes[1] = -1;
        this.nonBasicIndexes[0] = -1;

        this.nVars = width + height - 3;
        this.rows = new Array(this.nVars);
        this.cols = new Array(this.nVars);

        for (var v = 0; v < this.nVars; v += 1) {
            this.rows[v] = -1;
            this.cols[v] = -1;
        }
    };
    //-------------------------------------------------------------------
    //-------------------------------------------------------------------
    Tableau.prototype.getNumberOfNonIntegralValue = function () {
        var nIntegerVars = this.integerIndexes.length;
        var nbNonIntegralValues = 0;
        for (var v = 0; v < nIntegerVars; v++) {
            var varIndex = this.integerIndexes[v];
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
    Tableau.prototype.getNumberOfIntegerVariables = function () {
        return this.integerIndexes.length;
    };
    //-------------------------------------------------------------------
    //-------------------------------------------------------------------
    function Variable(index, value) {
        this.index = index;
        this.value = value;
    }
    //-------------------------------------------------------------------
    //-------------------------------------------------------------------
    Tableau.prototype.getMostFractionalVar = function () {
        var biggestFraction = 1;
        var mostFractionalVarIndex = null;
        var mostFractionalVarValue = null;
        var mid = 0.49; // No idea why, but 0.49 || 0.51 seem to work better than 0.5

        var nIntegerVars = this.integerIndexes.length;
        for (var v = 0; v < nIntegerVars; v++) {
            var varIndex = this.integerIndexes[v];
            var varRow = this.rows[varIndex];
            if (varRow === -1) {
                continue;
            }

            var varValue = this.matrix[varRow][this.rhsColumn];
            var fraction = Math.abs(varValue % 1 - mid);
            if (biggestFraction > fraction) {
                biggestFraction = fraction;
                mostFractionalVarIndex = varIndex;
                mostFractionalVarValue = varValue;
            }
        }

        return new Variable(mostFractionalVarIndex, mostFractionalVarValue);
    };
    //-------------------------------------------------------------------
    //-------------------------------------------------------------------
    Tableau.prototype.setFeasibility = function () {
        // All the basic variables should be equal or greater than 0
        var lastRow = this.height - 1;
        for (var r = 2; r <= lastRow; r += 1) {
            var varValue = this.matrix[r][this.rhsColumn];
            if (varValue < -1e-9) {
                this.feasible = false;
                return false;
            }
        }

        this.feasible = true;
        return true;
    };
    //-------------------------------------------------------------------
    //-------------------------------------------------------------------
    Tableau.prototype.finalize = function () {
        // Rounding objective value
        var value = this.matrix[this.objectiveRowIndex][this.rhsColumn];
        var roundedValue = Math.round(value);
        if (Math.abs(value - roundedValue) < this.precision) {
            this.matrix[this.objectiveRowIndex][this.rhsColumn] = roundedValue;
        }

        this.objectiveValue = this.matrix[this.objectiveRowIndex][this.rhsColumn];
    };
    //-------------------------------------------------------------------
    //-------------------------------------------------------------------
    Tableau.prototype.compileSolution = function () {
        var lastRow  = this.height - 1;
        for (var r = 2; r <= lastRow; r += 1) {
            var varIndex = this.basicIndexes[r];
            if (varIndex >= this.nObjectiveVars) {
                continue;
            }

            var variableId = this.variableIds[varIndex];
            if (variableId !== undefined) {
                var varValue = this.matrix[r][this.rhsColumn];
                var roundedValue = Math.round(varValue);
                if (Math.abs(varValue - roundedValue) < this.precision) {
                    this.solutionSet[variableId] = roundedValue;
                } else {
                    this.solutionSet[variableId] = varValue;
                }
            }
        }

        var opCoeff = (this.optimizationType === 'max') ? -1 : 1;
        this.objectiveValue = opCoeff * this.matrix[this.objectiveRowIndex][this.rhsColumn];
    };

    //-------------------------------------------------------------------
    // Description: Apply simplex to obtain a BFS
    //              used as phase1 of the simplex
    //
    //-------------------------------------------------------------------
    Tableau.prototype.simplexLeavingFirst = function() {
        var matrix     = this.matrix;
        var rhsColumn  = this.rhsColumn;
        var lastColumn = this.width - 1;
        var lastRow    = this.height - 1;

        var iterations = 0;
        while (true) {
            // Selecting leaving variable (feasibility condition):
            // Basic variable with most negative value
            var leavingRow   = 0;
            var leavingValue = 0;
            for (var r = 2; r <= lastRow; r++) {
                var value = matrix[r][rhsColumn];
                if (value < leavingValue) {
                    leavingValue = value;
                    leavingRow = r;
                }
            }

            // If nothing is strictly smaller than 0; we're done with phase 1.
            if (leavingRow === 0) {
                // Feasible, champagne!
                this.feasible = true;
                return iterations
            }

            // Selecting entering variable
            var enteringColumn = 0;
            var minQuotient    = Infinity;

            var row = matrix[leavingRow];
            var rhsValue = row[rhsColumn];
            for (var c = 1; c <= lastColumn; c++) {
                var colValue = row[c];
                if (colValue === 0) {
                    continue;
                }

                var quotient = rhsValue / colValue;
                if (quotient >= 0 && minQuotient > quotient) {
                    minQuotient    = quotient;
                    enteringColumn = c;
                }
            }

            if (minQuotient === Infinity) {
                // Not feasible
                this.feasible = false;
                return iterations;
            }

            this.pivot(leavingRow, enteringColumn);
            iterations += 1;
        }
    };


    //-------------------------------------------------------------------
    // Description: Apply simplex to obtain optimal soltuion
    //              used as phase2 of the simplex
    //
    //-------------------------------------------------------------------
    Tableau.prototype.simplexEnteringFirst = function() {
        var matrix     = this.matrix;
        var rhsColumn  = this.rhsColumn;
        var lastColumn = this.width - 1;
        var lastRow    = this.height - 1;

        var iterations = 0;
        while (true) {
            var objectiveRow = matrix[this.objectiveRowIndex];

            // Selecting entering variable (optimality condition)
            var enteringColumn = 0;
            var enteringValue  = 0;
            for (var c = 1; c <= lastColumn; c++) {
                var value = objectiveRow[c];
                if (value > enteringValue) {
                    enteringValue  = value;
                    enteringColumn = c;
                }
            }

            // If nothing is greater than 0; we're done with phase 2.
            if (enteringColumn === 0) {
                return iterations;
            }

            // Selecting leaving variable
            var leavingRow  = 0;
            var minQuotient = Infinity;

            for (var r = 2; r <= lastRow; r++) {
                var rhsValue = matrix[r][rhsColumn];
                var colValue = matrix[r][enteringColumn];
                if (rhsValue === 0 && colValue > 0) {
                    minQuotient = 0;
                    leavingRow  = r;
                    break;
                }

                var quotient = rhsValue / colValue;
                if (quotient > 0 && minQuotient > quotient) {
                    minQuotient = quotient;
                    leavingRow  = r;
                }
            }

            if (minQuotient === Infinity) {
                // TODO: solution is not bounded
                // optimal value is -Infinity
                return iterations;
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
    Tableau.prototype.pivot = function(pivotRowIndex, pivotColumnIndex) {
        var matrix     = this.matrix;
        var quotient   = matrix[pivotRowIndex][pivotColumnIndex];
        var lastRow    = this.height - 1;
        var lastColumn = this.width - 1;

        var leavingBasicIndex  = this.basicIndexes[pivotRowIndex];
        var enteringBasicIndex = this.nonBasicIndexes[pivotColumnIndex];

        this.basicIndexes[pivotRowIndex]       = enteringBasicIndex;
        this.nonBasicIndexes[pivotColumnIndex] = leavingBasicIndex;

        this.rows[enteringBasicIndex] = pivotRowIndex;
        this.rows[leavingBasicIndex]  = -1;

        this.cols[enteringBasicIndex] = -1;
        this.cols[leavingBasicIndex]  = pivotColumnIndex;

        // Divide everything in the target row by the element @
        // the target column
        var pivotRow = matrix[pivotRowIndex];

        for (var column = 0; column <= lastColumn; column++) {
            if (pivotRow[column] !== 0) {
                pivotRow[column] /= quotient;
            }
        }

        // for every row EXCEPT the pivot row,
        // set the value in the pivot column = 0 by
        // multiplying the value of all elements in the objective
        // row by ... yuck... just look below; better explanation later
        for (var r = 0; r <= lastRow; r++) {
            var row = matrix[r];
            if (r === pivotRowIndex) {
                row[pivotColumnIndex] = 1 / quotient;
            } else {
                var coefficient = row[pivotColumnIndex];
                // No point Burning Cycles if
                // Zero to the thing
                if (coefficient !== 0) {
                    for (var c = 0; c <= lastColumn; c++) {
                        // No point in doing math if you're just adding
                        // Zero to the thing
                        var v0 = pivotRow[c];
                        if (v0 !== 0) {
                            var v1 = row[c] - coefficient * v0;
                            
                            // Optimising out variable coefficients that are virtually 0
                            if (-1e-9 < v1 && v1 < 1e-9) {
                                row[c] = 0;
                            } else {
                                row[c] = v1;
                            }
                        }
                    }

                    row[pivotColumnIndex] = -coefficient / quotient;
                }
            }
        }
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

        console.log('****', message, '****');
        console.log('this.variableIds', this.variableIds, this.width);
        console.log('this.basicIndexes', this.basicIndexes);
        console.log('this.nonBasicIndexes', this.nonBasicIndexes);
        console.log('this.rows', this.rows);
        console.log('this.cols', this.cols);
        var varNameRowString = '';
        var spacePerColumn = [' '];
        for (var c = 1; c < this.width; c += 1) {
            var varName = this.variableIds[this.nonBasicIndexes[c]];
            var varNameLength = varName.length;
            var nSpaces = Math.abs(varNameLength - 5);
            var valueSpace = ' ';
            var nameSpace = ' ';
            for (var s = 0; s < nSpaces; s += 1) {
                if (varNameLength > 5) {
                    valueSpace += ' ';
                } else {
                    nameSpace += ' ';
                }
            }
            spacePerColumn[c] = valueSpace;

            varNameRowString += nameSpace + varName;
        }
        console.log(varNameRowString);

        var signSpace;

        // Displaying feasibility row
        var firstRow = this.matrix[this.feasbilityRowIndex];
        var firstRowString = '';
        for (var j = 1; j < this.width; j += 1) {
            signSpace = firstRow[j] < 0 ? '' : ' ';
            firstRowString += signSpace + spacePerColumn[j] + firstRow[j].toFixed(2)
        }
        signSpace = firstRow[0] < 0 ? '' : ' ';
        firstRowString += signSpace + spacePerColumn[0] + firstRow[0].toFixed(2);
        console.log(firstRowString + ' W');

        // Displaying objective
        var firstRow = this.matrix[this.objectiveRowIndex];
        var firstRowString = '';
        for (var j = 1; j < this.width; j += 1) {
            signSpace = firstRow[j] < 0 ? '' : ' ';
            firstRowString += signSpace + spacePerColumn[j] + firstRow[j].toFixed(2)
        }
        signSpace = firstRow[0] < 0 ? '' : ' ';
        firstRowString += signSpace + spacePerColumn[0] + firstRow[0].toFixed(2);
        console.log(firstRowString + ' Z');

        // Then the basic variable rows
        for (var r = 2; r < this.height; r += 1) {
            var row = this.matrix[r];
            var rowString = '';
            for (var c = 1; c < this.width; c += 1) {
                signSpace = row[c] < 0 ? '' : ' ';
                rowString += signSpace + spacePerColumn[c] + row[c].toFixed(2)
            }
            signSpace = row[0] < 0 ? '' : ' ';
            rowString += signSpace + spacePerColumn[0] + row[0].toFixed(2);
            console.log(rowString + ' ' + this.variableIds[this.basicIndexes[r]]);
        }
        console.log('');
    };
    //-------------------------------------------------------------------
    //-------------------------------------------------------------------
    Tableau.prototype.parseModel = function (model) {
        this.optimizationType = model.opType;
        var opCoeff = (this.optimizationType === 'max') ? -1 : 1;

        var variables   = model.variables;
        var constraints = model.constraints;

        var integerVarIds = model.ints || {};

        var variableIds   = Object.keys(variables);   //Array with name of each Variable
        var constraintIds = Object.keys(constraints); //Array with name of each constraint type

        var nObjectiveVars = variableIds.length;
        var nConstraints = constraintIds.length;

        var nSlackVars = 0;

        // FIGURE OUT HEIGHT
        var height = 2;
        for (var c = 0; c < nConstraints; c += 1) {
            var constraintId = constraintIds[c];
            var constraint = constraints[constraintId];

            if (constraint.equal !== undefined) {
                constraint.min = constraint.equal;
                constraint.max = constraint.equal;
            }

            if (constraint.min !== undefined) {
                constraint.min_loc = height;
                nSlackVars += 1;
                height += 1;
            }

            if (constraint.max !== undefined) {
                constraint.max_loc = height;
                nSlackVars += 1;
                height += 1;
            }
        }

        // FIGURE OUT WIDTH
        var rhsColumn = 0;
        var slackColumn = 1 + nObjectiveVars;
        var articialColumn = slackColumn + nSlackVars;
        var width = 1 + nObjectiveVars + nSlackVars - height + 2;

        this.initialize(width, height, variableIds, nObjectiveVars, nSlackVars);

        var matrix = this.matrix;

        var rows = this.rows;
        var cols = this.cols;

        var basicIndexes    = this.basicIndexes;
        var nonBasicIndexes = this.nonBasicIndexes;

        var objectiveCoefficients  = matrix[this.objectiveRowIndex];
        var feasbilityCoefficients = matrix[this.feasbilityRowIndex];

        var integerIndexes = this.integerIndexes;

        // Give all of the variables a self property of 1
        for (var v = 0; v < nObjectiveVars; v += 1) {
            var variableId = variableIds[v];
            variables[variableId][variableId] = 1;

            //if a min or max exists in the variables;
            //add it to the constraints
            if (variables[variableId].max !== undefined) {
                constraints[variableId]     = constraints[variableId] || {};
                constraints[variableId].max = variables[variableId].max;
            }

            if (variables[variableId].min !== undefined) {
                constraints[variableId]     = constraints[variableId] || {};
                constraints[variableId].min = variables[variableId].min;
            }

            if (integerVarIds[variableId] !== undefined) {
                integerIndexes.push(v);
            }

            rows[v] = -1;
            cols[v] = v + 1;

            nonBasicIndexes[v + 1] = v;
        }

        // LOOP IT AGAIN!!!
        var ci = 2; // Constraint index
        var si = 0; // Slack variable index
        var ai = 0; // Artificial variable index

        var nbi = 2 + nObjectiveVars; // non-basic variable index
        for (var c = 0; c < nConstraints; c += 1) {
            var rhs;
            var constraintId = constraintIds[c];
            var constraint = constraints[constraintId];

            if (constraint.min !== undefined) {
                rhs = constraint.min;

                matrix[ci][rhsColumn] = -rhs; // DO RHS
                feasbilityCoefficients[rhsColumn] += rhs;

                rows[slackColumn + si - 1] = ci;
                cols[slackColumn + si - 1] = -1;

                basicIndexes[ci] = slackColumn + si - 1;

                variableIds[slackColumn + si - 1] = 's' + si;

                ci += 1; // One more constraint
                si += 1; // One more slack varaible
            }

            if (constraint.max !== undefined) {
                matrix[ci][rhsColumn] = constraint.max; // DO RHS

                basicIndexes[ci] = slackColumn + si - 1;

                rows[slackColumn + si - 1] = ci;
                cols[slackColumn + si - 1] = -1;

                variableIds[slackColumn + si - 1] = 's' + si;

                ci += 1;
                si += 1;
            }
        }

        // LOADING THE TABLE
        var objectiveName = model.optimize;
        for (var v = 0; v < nObjectiveVars; v += 1) {
            var column = v + 1;

            var variableConstraints = variables[variableIds[v]];
            var constraintNames = Object.keys(variableConstraints);
            for (c = 0; c < constraintNames.length; c += 1) {
                var constraintName = constraintNames[c];

                var coefficient = variableConstraints[constraintName];
                if (constraintName === objectiveName) {
                    objectiveCoefficients[column] = - opCoeff * coefficient;
                } else {
                    var constraint = constraints[constraintName];
                    if (constraint !== undefined) {
                        var row;

                        if (constraint.min !== undefined) {
                            row = constraint.min_loc;
                            matrix[row][column] = -coefficient;
                            feasbilityCoefficients[column] += coefficient;
                        }

                        if (constraint.max !== undefined) {
                            row = constraint.max_loc;
                            matrix[row][column] = coefficient;
                        }
                    }
                }
            }
        }
    };

    Tableau.prototype.addCutConstraint = function (cut) {
        var rowIndex = this.height;
        var row = new Array(this.width);
        for (var r = 0; r < this.width; r++) {
            row[r] = 0;
        }
        this.matrix.push(row);

        if (cut.type === 'min') {
            // Min constraint
            row[this.rhsColumn] = -cut.value;
            row[this.cols[cut.varIndex]] = -1;
        } else {
            // Max constraint
            row[this.rhsColumn] = cut.value;
            row[this.cols[cut.varIndex]] = 1;
        }

        var newVarIndex = this.nVars;
        this.basicIndexes[rowIndex] = newVarIndex;

        this.rows.push(rowIndex);
        this.cols.push(-1);

        this.variableIds[newVarIndex] = 's' + this.nSlackVars;
        this.nSlackVars += 1;

        this.height += 1;
        this.nVars += 1;
    };

    Tableau.prototype.copy = function () {
        var copy = new Tableau(this.precision);

        copy.width  = this.width;
        copy.height = this.height;

        copy.nVars = this.nVars;

        copy.nObjectiveVars = this.nObjectiveVars;
        copy.nSlackVars     = this.nSlackVars;

        // Making a shallow copy of integer variable indexes
        copy.integerIndexes = this.integerIndexes;

        // All the other arrays are deep copied
        copy.basicIndexes    = this.basicIndexes.slice();
        copy.nonBasicIndexes = this.nonBasicIndexes.slice();

        copy.rows = this.rows.slice();
        copy.cols = this.cols.slice();

        copy.variableIds = this.variableIds.slice();

        var matrix = this.matrix;
        var matrixCopy = new Array(this.height);
        for (var r = 0; r < this.height; r++) {
            matrixCopy[r] = matrix[r].slice();
        }

        copy.matrix = matrixCopy;

        return copy;
    };

    //-------------------------------------------------------------------
    // Function: Solve
    // Detail: Main function, linear programming solver
    //-------------------------------------------------------------------
    Tableau.prototype.solve = function () {
        // Execute Phase 1 to obtain a Basic Feasible Solution (BFS)
        this.simplexLeavingFirst();

        // Execute Phase 2
        if (this.feasible === true) {
            // Running simplex on Initial Basic Feasible Solution (BFS)
            // N.B current solution is feasible
            this.simplexEnteringFirst();
        }

        this.finalize();
        return this;
    };
    //-------------------------------------------------------------------
    //-------------------------------------------------------------------
    function Cut(type, varIndex, value) {
        this.type = type;
        this.varIndex = varIndex;
        this.value = value;
    }
    //-------------------------------------------------------------------
    //-------------------------------------------------------------------
    function Branch(tableau, lowerBound, nbNonIntegralValues, cuts) {
        this.tableau = tableau;
        this.lowerBound = lowerBound;
        this.nbNonIntegralValues = nbNonIntegralValues;
        this.cuts = cuts;
    }

    //-------------------------------------------------------------------
    // Function: MILP
    // Detail: Main function, my attempt at a mixed integer linear programming
    //         solver
    //-------------------------------------------------------------------
    function MILP(originalTableau) {
        var branches = [];

        var iterations = 0;

        // This is the default result
        // If nothing is both *integral* and *feasible*
        var bestSolution = {
            objectiveValue: 1e99,
            feasible: false
        };

        function sortByLowerBound(a, b) {
            return b.lowerBound - a.lowerBound;
        }

        function sortByNbIntegralValues(a, b) {
            return b.nbNonIntegralValues - a.nbNonIntegralValues;
        }

        function sortAdvanced(a, b) {
            var cmp = b.nbNonIntegralValues - a.nbNonIntegralValues;
            if (cmp === 0) {
                return b.lowerBound - a.lowerBound;
            } else {
                return cmp;
            }
        }

        // And here...we...go!

        // 1.) Load a model into the queue
        var nbIntegerVariables = originalTableau.getNumberOfIntegerVariables();
        var branch = new Branch(originalTableau, -Infinity, nbIntegerVariables, []);
        branches.push(branch);

        // If all branches have been exhausted terminate the loop
        while (branches.length > 0) {
            // Get a model from the queue
            branch = branches.pop();

            if (branch.lowerBound > bestSolution.objectiveValue) {
                continue;
            }

            // Solve it
            var tableau = originalTableau.copy();
            var cuts = branch.cuts;
            if (cuts.length !== 0) {
                for (var c = 0; c < cuts.length; c += 1) {
                    tableau.addCutConstraint(cuts[c]);
                }
            }

            var solution = tableau.solve();

            // Keep Track of how many cycles
            // we've gone through
            iterations++;

            if (solution.feasible === false) {
                continue;
            }

            // Is the model both integral and feasible?
            var nbNonIntegralValues = solution.getNumberOfNonIntegralValue();
            if (nbNonIntegralValues === 0) {
                // Is the new result the bestSolution that we've ever had?
                if (solution.objectiveValue < bestSolution.objectiveValue) {
                    // Store the solution as the bestSolution
                    bestSolution = solution;
                }

                // The solution is feasible and interagal;
                // But it is worse than the current solution;
                // Ignore it.
            } else if (solution.objectiveValue < bestSolution.objectiveValue) {
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
                var variable = solution.getMostFractionalVar();

                var cutHigh = new Cut('min', variable.index, Math.ceil(variable.value));
                var cutLow  = new Cut('max', variable.index, Math.floor(variable.value));

                var cutsHigh = cuts.slice();
                var cutsLow  = cuts.slice();

                cutsHigh.push(cutHigh);
                cutsLow.push(cutLow);

                var lowerBound = solution.objectiveValue;
                branches.push(new Branch(tableau, lowerBound, nbNonIntegralValues, cutsHigh));
                branches.push(new Branch(tableau, lowerBound, nbNonIntegralValues, cutsLow));

                // Sorting branches
                // Branches with the most promising lower bounds
                // will be picked first
                branches.sort(sortByLowerBound);
            }
        }
        bestSolution.iter = iterations;

        return bestSolution;
    };


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
        tableau.parseModel(model);

        if (tableau.getNumberOfIntegerVariables() > 0) {
            tableau = MILP(tableau);
        } else {
            tableau.solve();
        }

        tableau.compileSolution();
        // If the user asks for a full breakdown
        // of the tableau (e.g. full === true)
        // this will return it
        if (full) {
            return tableau;
        } else {
        // Otherwise; give the user the bare
        // minimum of info necessary to carry on
        
            var store = {};

            // 1.) Add in feasibility to store;
            store.feasible = tableau.feasible;

            // 2.) Add in the objective value
            store.result = tableau.objectiveValue;

            // 3.) Load all of the variable values
            Object.keys(tableau.solutionSet)
                .map(function (d) {
                    store[d] = tableau.solutionSet[d];
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
        variables   = Object.keys(model.variables);   //Array with name of each Variable

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
(function () {
    if (typeof module !== "undefined" && module.exports) {
        module.exports = new Solver();
    } else if (typeof define === "function") {
        define([], function () {
            return Solver;
        });
    }
})();
/* jshint ignore:end */
