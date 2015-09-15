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

    // Expose the obj to the world for testing; Maybe remove from production
    this._helpers = obj;

    //-------------------------------------------------------------------
    // Function: max
    // Puprose: Iterate over a 1d array to find its max
    //
    // Example: obj.max([1,3,4,5,6]) === 6
    //-------------------------------------------------------------------
    obj.max = function (ary, offset) {
        var i,
            tmp = -1e99,
            len = ary.length;

        offset = offset || 0;

        for (i = 0; i < len - offset; i++) {
            // tmp = ary[i] > tmp ? (ary[i] || 0) : tmp;
            val = ary[i];
            tmp = val < tmp ? val : tmp;
        }
        return tmp;
    };

    function MinData(value, index) {
        this.value = value;
        this.index = index;
    };

    //-------------------------------------------------------------------
    // Function: min
    // Puprose: Iterate over a 1d array to find its min
    //
    // Example: obj.min([1,3,4,5,6], 1) === 1
    // Example: obj.min([3,4,5,6,1], 1) === 3
    //-------------------------------------------------------------------
    obj.min = function (array, offset) {
        var last = array.length - offset;

        var min = array[0];
        var minIndex = 0;

        for (var i = 0; i < last; i++) {
            var val = array[i];
            if (val < min) {
                min = val;
                minIndex = i;
            }
        }

        return new MinData(min, minIndex);
    };

    //-------------------------------------------------------------------
    // Quick and dirty method to round numbers
    //-------------------------------------------------------------------
    obj.round = function (num, precision) {
        return Math.round(num *
            Math.pow(10, precision - 0)) / (Math.pow(10, precision -
            0));
    };

    /****************************************************
     * Credit: http://stackoverflow.com/questions/
     *              1885557/simplest-code-for-array-
     *              intersection-in-javascript
     *
     * Method to get the intersecting keys from 2 Objects
     * todo: benchmark this against other methods
     *
     * **************************************************
     */
    obj.shared = function (a, b) {
        a = Object.keys(a);
        b = Object.keys(b);

        return a.filter(function (d) {
            return obj.indexOf(b, d) !== -1;
        });
    };


    //-------------------------------------------------------------------
    // Function to see if a number is an integer or not
    //-------------------------------------------------------------------
    obj.isInt = function (num, precision) {
        precision = precision || 5;
        return Math.round(num) === obj.round(num, precision);
    };

    //-------------------------------------------------------------------
    // Function to check the intregrality of the solution
    //-------------------------------------------------------------------
    obj.integral = function (model, solution, precision) {
        var i,
            keys = obj.shared(model.ints, solution);

        for (i = 0; i < keys.length; i++) {
            if (!obj.isInt(solution[keys[i]], precision)) {
                return false;
            }
        }
        return true;
    };

    //-------------------------------------------------------------------
    // Function to find the most fractional variable of the 'ints' constraints
    //-------------------------------------------------------------------
    obj.frac = function (model, solution) {
        var best = 10,
            split = "",
            val = 0.49, // No idea why, but 0.49 || 0.51 seem to work better than 0.5
            key;
        for (key in model.ints) {
            if (best > Math.abs(solution[key] % 1 - val)) {
                best = Math.abs((solution[key] % 1 - val));
                split = key;
            }
        }
        return split;
    };

    //-------------------------------------------------------------------
    // Function to find the most fractional variable of the 'ints' constraints
    //-------------------------------------------------------------------
    obj.indexOf = function (ary, fin) {
        for (var i = 0; i < ary.length; i++) {
            if (ary[i] === fin) {
                return i;
            }
        }
        return -1;
    };

    //-------------------------------------------------------------------
    // Function: pivot
    // Purpose: Execute pivot operations over a 2d array,
    //          on a given row, and column
    //
    // Example: obj.pivot([[1,2,3],[4,5,6],[7,8,9]],1,2) ==>
    //          [[-0.6,0,0.6],[0.8,1,1.2],[0.6,0,-0.6]]
    //
    //-------------------------------------------------------------------
    obj.pivot = function (tbl, row, col) {

        var target = tbl[row][col],
            length = tbl.length,
            width = tbl[0].length,
            pivot_row,
            i,
            j;


        // Divide everything in the target row by the element @
        // the target column
        for (i = 0; i < width; i++) {
            if (tbl[row][i] !== 0) {
                tbl[row][i] /= target;
            }
        }


        // for every row EXCEPT the target row,
        // set the value in the target column = 0 by
        // multiplying the value of all elements in the objective
        // row by ... yuck... just look below; better explanation later
        for (i = 0; i < length; i++) {
            if (i !== row) {
                pivot_row = tbl[i][col];
                // No point Burning Cycles if
                // Zero to the thing
                if (pivot_row !== 0) {
                    for (j = 0; j < width; j++) {
                        // No point in doing math if you're just adding
                        // Zero to the thing
                        var v0 = tbl[row][j];
                        if (v0 !== 0) {
                            var v1 = tbl[i][j] - pivot_row * v0;
                            if (-1e-9 < v1 && v1 < 1e-9) {
                                tbl[i][j] = 0;
                            } else {
                                tbl[i][j] = v1;
                            }
                        }
                    }
                }
            }
        }
    };




    // NOTE!!!
    // The point of phase 1 and phase 2 are to find where to pivot next;
    // and track what pivots have been made. The grunt work is done by
    // the pivot function.

    function Pivot(row, column, feasibility, optimality) {
        this.row = row;
        this.column = column;
        this.feasibility = feasibility;
        this.optimality = optimality;
    }

    //-------------------------------------------------------------------
    // Function: phase1
    // Purpose: Convert a non standard form tableau
    //          to a standard form tableau by eliminating
    //          all negative values in the right hand side
    //
    // Example: obj.phase1(tbl, tracker)...
    //
    //-------------------------------------------------------------------
    obj.phase1 = function (tbl) {
        var rhs_min = 1e99,
            row,
            col,
            len = tbl[0].length - 1;

        // Find the smallest value and location
        // in the RHS Since the lowest point on
        // the RHS will be our next
        // pivot row
        for (var i = 0; i < tbl.length - 1; i++) {
            if (tbl[i][len] < rhs_min) {
                rhs_min = tbl[i][len];
                row = i;
            }
        }
        // If nothing is less than 0; we're done with phase 1.
        if (rhs_min >= 0) {
            return new Pivot(0, 0, true, false);
        } else {
            // The Smallest negative entry in our next pivot
            // row will be the column we pivot on next
            var minColumnData = obj.min(tbl[row], 1);
            if (minColumnData.value >= 0) {
                // If everything in this row is > 0
                // we need to hop out of phase 1
                return new Pivot(0, 0, true, false);
            } else {
                // Return an object telling us which
                // row and column to pivot on
                return new Pivot(row, minColumnData.index, false, false);
            }
        }
    };

    //-------------------------------------------------------------------
    // Function: phase2
    // Purpose: Convert a non standard form tableau
    //          to a standard form tableau by eliminating
    //          all negative values in the right hand side
    //
    // Example: obj.phase1(tbl, tracker)...
    //
    //-------------------------------------------------------------------
    obj.phase2 = function (tbl) {
        var row,
            length = tbl.length - 1,
            width = tbl[0].length - 1,
            min,
            i,
            tCol,
            test,
            dividend = 1e99;

        // Step 1. Identify the smallest entry in the objective row
        //         (the bottom)
        var minColumnData = obj.min(tbl[length], 1);

        // Step 2a. If its non-negative, stop. A solution has been found
        if (minColumnData.value >= 0) {
            return new Pivot(0, 0, true, true);
        } else {
            // Step 2b. Otherwise, we have our pivot column
            var col = minColumnData.index;

            // Step 3a. If all entries in the pivot column are <= 0;
            // stop. The solution is unbounded;


            for (i = 0; i < (length); i++) {
                tCol = tbl[i][col];
                if (tCol > 0.001) {
                    test = (tbl[i][width]) / (tCol);
                    if (test < dividend) {
                        row = i;
                        dividend = test;
                    }
                }
            }


            if (dividend > -0.001 && dividend < 1e99) {
                return new Pivot(row, col, true, false);
            } else {
                return new Pivot(row, col, false, false);
            }
        }
    };

    //-------------------------------------------------------------------
    // Function: optimize
    // Purpose: Convert a non standard form tableau
    //          to a standard form tableau by eliminating
    //          all negative values in the right hand side
    //
    // Example: obj.phase1(tbl, tracker)...
    //
    //-------------------------------------------------------------------
    obj.optimize = function (tbl) {
        var tracker = [],
            results = {},
            i,
            pivot,
            length = tbl.length - 1,
            width = tbl[0].length - 1;

        // Create a transposition of the array to track changes;

        // Execute Phase 1 to Normalize the tableau;
        for (i = 0; i < 1000; i++) {
            pivot = obj.phase1(tbl);
            if (pivot.feasibility === true) {
                break;
            } else {
                tracker[pivot.row] = pivot.column - 1;
                obj.pivot(tbl, pivot.row, pivot.column);
            }
        }

        // Execute Phase 2 to Finish;
        for (i = 0; i < 1000; i++) {
            pivot = obj.phase2(tbl);
            if (pivot.optimality === false) {
                tracker[pivot.row] = pivot.column - 1;
                obj.pivot(tbl, pivot.row, pivot.column, tracker);
            } else {
                if (pivot.feasibility === false) {
                    results.feasible = false;
                }
                break;
            }
        }

        // Describe whats going on here
        for (i = 0; i < tracker.length; i++) {
            results[tracker[i]] = tbl[i][width];
        }

        // Store the result of the problem
        results.result = tbl[length][width];

        var feas = 1;
        for (i = 0; i < length; i++) {
            feas *= tbl[i][width] > -0.001;
        }

        results.feasible = feas;
        return results;

    };

    //-------------------------------------------------------------------
    //Function: Solve
    //Detail: Main function, linear programming solver
    //-------------------------------------------------------------------
    obj.Solve = function (model) {
        var opType = model.opType === "max" ? -1 : 1;

        var variables   = model.variables;
        var constraints = model.constraints;

        var variableIds   = Object.keys(variables);   //Array with name of each Variable
        var constraintIds = Object.keys(constraints); //Array with name of each constraint type

        var nVariables   = variableIds.length;
        var nConstraints = constraintIds.length;

        // Give all of the variables a self property of 1
        for (var v = 0; v < nVariables; v += 1) {
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
        }

        // FIGURE OUT HEIGHT
        var height = 1;
        for (var c = 0; c < nConstraints; c += 1) {
            var constraintId = constraintIds[c];
            if (constraints[constraintId].min !== undefined) {
                constraints[constraintId].min_loc = height - 1;
                height += 1;
            }

            if (constraints[constraintId].max !== undefined) {
                constraints[constraintId].max_loc = height - 1;
                height += 1;
            }
        }

        // FIGURE OUT WIDTH
        var width  = 1 + height + nVariables;

        // BUILD A FAKE ROW OF THAT WIDTH
        var tmpRow = new Array(width);
        for (var i = 0; i < width; i++) {
            tmpRow[i] = 0;
        }

        // BUILD AN EMPTY TABLEAU
        /* jshint ignore:start */
        var table = new Array(height);
        for (var j = 0; j < height; j++) {
            table[j] = tmpRow.slice();
        }
        /* jshint ignore:end */

        // LOOP IT AGAIN!!!
        var z = 0;
        for (var c = 0; c < nConstraints; c += 1) {
            var constraintId = constraintIds[c];
            if (constraints[constraintId].min !== undefined) {
                // LOAD SLACK
                table[z][nVariables + 1 + z] = 1;
                // DO RHS
                table[z][width - 1] = -constraints[constraintId].min;
                // COUNTER += 1...
                z += 1;
            }

            if (constraints[constraintId].max !== undefined) {
                // LOAD SLACK
                table[z][nVariables + 1 + z] = 1;

                // DO RHS
                table[z][width - 1] = constraints[constraintId].max;

                z += 1;
            }
        }

        // Because it needs it...
        table[height - 1][0] = 1;

        // TRY LOADING THE TABLE
        var optimizerName = model.optimize;
        for (v = 0; v < nVariables; v += 1) {
            // Get the column's location
            var column = v + 1;

            var variableConstraints = variables[variableIds[v]];
            // for (var constraintName in variableConstraints) {

            var constraintNames = Object.keys(variableConstraints);
            for (c = 0; c < constraintNames.length; c += 1) {
                var constraintName = constraintNames[c];

                var coefficient = variableConstraints[constraintName];
                if (constraintName === optimizerName) {
                    table[height - 1][column] = opType * coefficient;
                } else if (constraints[constraintName] !== undefined) {
                    var row,
                        value,
                        constraint = constraints[constraintName];

                    if (constraint.min !== undefined) {
                        row = constraint.min_loc;
                        table[row][column] = -coefficient;
                    }

                    if (constraint.max !== undefined) {
                        row = constraint.max_loc;
                        table[row][column] = coefficient;
                    }
                }
            }
        }

        // SOLVE THE PROBLEM
        // NOW THAT WE FINALLY BUILT IT
        var solution = obj.optimize(table);

        var output = {
            feasible: solution.feasible
        };

        var variableIndexes = Object.keys(solution);
        var nVariableIndexes = variableIndexes.length;
        for (v = 0; v < nVariableIndexes; v += 1) {
            var variableIndex = variableIndexes[v];
            var variableId = variableIds[variableIndex];
            if (variableId !== undefined) {
                var variableValue = solution[variableIndex];
                if (variableValue < -1e-10) {
                    output.feasible = false;
                }
                output[variableId] = variableValue;
            }
        }

        output.result = -opType * solution.result;

        return output;
    };


    //-------------------------------------------------------------------
    // Function: MILP
    // Detail: Main function, my attempt at a mixed integer linear programming
    //         solver
    // Plan:
    //      What we're aiming at here is to
    //-------------------------------------------------------------------
    obj.MILP = function (model, precision) {
        obj.models = [];
        obj.priors = {};

        var y = 0,
            minmax = model.opType === "min" ? -1 : 1,
            solution = {},
            key,
            iHigh,
            iLow,
            branch_a,
            branch_b,
            tmp;



        // This is the default result
        // If nothing is both *integral* and *feasible*
        obj.best = {
            result: -1e99 * minmax,
            feasible: false
        };

        // And here...we...go!

        // 1.) Load a model into the queue
        obj.models.push(model);

        // If all branches have been exhausted, or we've been piddling around
        // for too long, one of these 2 constraints will terminate the loop
        while (obj.models.length > 0 && y < 1200) {
            // Get a model from the queue
            model = obj.models.pop();
            // Solve it
            solution = obj.Solve(model);

            // Is the model both integral and feasible?
            if (obj.integral(model, solution, precision) &&
                solution.feasible) {
                // Is the new result the best that we've ever had?
                if (
                    (solution.result * minmax) >
                    (obj.best.result * minmax)
                ) {
                    // Store the solution as the best
                    obj.best = solution;
                }

                // The solution is feasible and interagal;
                // But it is worse than the current solution;
                // Ignore it.


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


            } else if (solution.feasible && solution.result *
                minmax > minmax * obj.best.result) {

                // Find out where we want to split the solution
                key = obj.frac(model, solution);

                // Round up
                iHigh = Math.ceil(solution[key]);
                // Copy the old model into the new branch_a variable
                branch_a = JSON.parse(JSON.stringify(model));
                // If there was already a constraint on this variable, keep it; else add one
                branch_a.constraints[key] = branch_a.constraints[key] || {};
                // Set the new constraint on this variable
                branch_a.constraints[key].min = iHigh || 1;

                // We don't want the same models popping up all the time.
                // If it's been run once, we don't want to check it again,
                // and go through a possible infinite branching...
                //
                // To prevent this, we have a hash on the `obj` object
                // which uses the stringified version of the new model as the key.
                //
                // This is kind of similar to an MD5 or a SHA1 hash check, but
                // easier (and faster)

                tmp = JSON.stringify(branch_a.constraints);
                if (!obj.priors[tmp]) {
                    obj.priors[tmp] = 1;
                    obj.models.push(branch_a);
                }

                // Round down
                iLow = Math.floor(solution[key]);
                // Copy the old model into the new branch_a variable
                branch_b = JSON.parse(JSON.stringify(model));
                // If there was already a constraint on this variable, keep it; else add one
                branch_b.constraints[key] = branch_b.constraints[key] || {};
                // Set the new constraint on this variable
                branch_b.constraints[key].max = iLow || 0;

                // We don't want the same models popping up all the time.
                // If it's been run once, we don't want to check it again,
                // and go through a possible infinite branching...
                //
                // To prevent this, we have a hash on the `obj` object
                // which uses the stringified version of the new model as the key.
                //
                // This is kind of similar to an MD5 or a SHA1 hash check, but
                // easier (and faster)

                tmp = JSON.stringify(branch_b.constraints);
                if (!obj.priors[tmp]) {
                    obj.priors[tmp] = 1;
                    obj.models.push(branch_b);
                }

                // Keep Track of how many cycles
                // we've gone through
                y++;
            }
        }
        obj.best.iter = y;
        //obj.best.orig = orig;

        return obj.best;
    };


    /*************************************************************
     * Method: Solve
     * Scope: Public:
     * Agruments:
     *        model: The model we want solver to operate on
     *        precision: If we're solving a MILP, how tight
     *                   do we want to define an integer, given
     *                   that 20.000000000000001 is not an integer.
     *                   (defaults to 5)
     **************************************************************/
    this.Solve = function (model, precision) {
        // Make sure we at least have a model
        if (!model) {
            throw new Error("Solver requires a model to operate on");
        }

        precision = precision || 5;
        if (model.ints) {
            return obj.MILP(model, precision);
        } else {
            return obj.Solve(model);
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
