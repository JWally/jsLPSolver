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
            tmp = ary[i] > tmp ? ary[i] : tmp;
        }
        return tmp;
    };

    //-------------------------------------------------------------------
    // Function: min
    // Puprose: Iterate over a 1d array to find its min
    //
    // Example: obj.min([1,3,4,5,6]) === 1
    //-------------------------------------------------------------------
    obj.min = function (ary, offset) {
        var i,
            tmp = 1e99,
            len = ary.length;

        offset = offset || 0;

        for (i = 0; i < len - offset; i++) {
            tmp = ary[i] < tmp ? ary[i] : tmp;
        }
        return tmp;
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
            return b.indexOf(d) !== -1;
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
            key;
        for (key in model.ints) {
            if (model.ints.hasOwnProperty(key)) {
                if (best > Math.abs(solution[key] % 1 - 0.5)) {
                    best = Math.abs((solution[key] % 1 - 0.5));
                    split = key;
                }
            }
        }
        return split;
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
    obj.pivot = function (tbl, row, col, tracker) {

        var target = tbl[row][col],
            length = tbl.length,
            width = tbl[0].length,
            pivot_row,
            i,
            j;


        tracker[row] = col - 1;
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
                        if (tbl[row][j] !== 0) {
                            tbl[i][j] += -pivot_row * tbl[row][j];
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
            return true;
        } else {
            // The Smallest negative entry in our next pivot
            // row will be the column we pivot on next
            col = obj.min(tbl[row], 1);

            if (col >= 0) {
                // If everything in this row is > 0
                // we need to hop out of phase 1
                return true;
            } else {
                // Identify the column
                col = tbl[row].indexOf(col);
                // Return an object telling us which
                // row and column to pivot on
                return {
                    row: row,
                    col: col
                };
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
        var col,
            row,
            length = tbl.length - 1,
            width = tbl[0].length - 1,
            min,
            i,
            tCol,
            test,
            dividend = 1e99;

        // Step 1. Identify the smallest entry in the objective row
        //         (the bottom)
        min = obj.min(tbl[length], 1);

        // Step 2a. If its non-negative, stop. A solution has been found
        if (min >= 0) {
            return true;
        } else {
            // Step 2b. Otherwise, we have our pivot column
            col = tbl[length].indexOf(min);

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
                return {
                    row: row,
                    col: col
                };
            } else {
                return false;
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
            test,
            length = tbl.length - 1,
            width = tbl[0].length - 1;

        // Create a transposition of the array to track changes;

        // Execute Phase 1 to Normalize the tableau;
        for (i = 0; i < 1000; i++) {
            test = obj.phase1(tbl);
            if (test === true) {
                break;
            } else {
                obj.pivot(tbl, test.row, test.col, tracker);
            }
        }

        // Execute Phase 2 to Finish;
        for (i = 0; i < 1000; i++) {
            test = obj.phase2(tbl);
            if (typeof test === "object") {
                obj.pivot(tbl, test.row, test.col, tracker);
            } else {
                if (test === true) {
                    break;
                } else if (test === false) {
                    results.feasible = false;
                    break;
                }
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
    obj.Solve = function (model, gomory) {

        var cstr,
            vari,
            opType = model.opType === "max" ? -1 : 1,
            hsh,
            len,
            z = 0,
            i,
            j,
            x,
            c,
            v,
            rslts,
            tall = 1,
            wide = 1,
            table;


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



        cstr = Object.keys(model.constraints); //Array with name of each constraint type
        vari = Object.keys(model.variables); //Array with name of each Variable



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
        wide += tall + vari.length;

        // BUILD AN EMPTY TABLEAU
        /* jshint ignore:start */
        table = Array(tall);
        for (i = 0; i < tall; i++) {
            table[i] = Array(wide);

            for (j = 0; j < wide; j++) {
                table[i][j] = 0;
            }
        }
        /* jshint ignore:end */

        // LOOP IT AGAIN!!!
        z = 0;
        for (x in model.constraints) {
            if (typeof model.constraints[x].min !== "undefined") {
                // LOAD SLACK
                table[z][vari.length + 1 + z] = 1;
                // DO RHS
                table[z][wide - 1] = -model.constraints[x].min;

                z += 1;
            }

            if (typeof model.constraints[x].max !== "undefined") {
                // LOAD SLACK
                table[z][vari.length + 1 + z] = 1;

                // DO RHS
                table[z][wide - 1] = model.constraints[x].max;

                z += 1;
            }
        }

        // Because it needs it...
        table[tall - 1][0] = 1;


        // TRY LOADING THE TABLE
        for (v in model.variables) {
            // Get the column's location
            var col = vari.indexOf(v) + 1;
            for (var a in model.variables[v]) {
                if (a === model.optimize) {
                    table[tall - 1][col] = opType *
                        model.variables[v][a];
                } else if (typeof model.constraints[a] !== "undefined") {
                    var row,
                        val,
                        cns = model.constraints[a];

                    if (typeof cns.min !== "undefined") {
                        row = cns.min_loc;
                        val = -model.variables[v][a];
                        table[row][col] = val;
                    }

                    if (typeof cns.max !== "undefined") {
                        row = cns.max_loc;
                        val = model.variables[v][a];
                        table[row][col] = val;
                    }
                }
            }
        }


        // SOLVE THE PROBLEM
        // NOW THAT WE FINALLY BUILT IT
        rslts = obj.optimize(table);



        hsh = {
            feasible: rslts.feasible
        };

        for (x in rslts) {
            if (typeof vari[x] !== "undefined") {
                if (rslts[x] < 0) {
                    hsh.feasible = false;
                }
                hsh[vari[x]] = rslts[x];
            }
        }

        hsh.result = -opType * rslts.result;

        return hsh;
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

                iLow = Math.floor(solution[key]);
                branch_b = JSON.parse(JSON.stringify(model));
                branch_b.constraints[key] = branch_b.constraints[key] || {};
                branch_b.constraints[key].max = iLow || 0;


                tmp = JSON.stringify(branch_b.constraints);
                if (!obj.priors[tmp]) {
                    obj.priors[tmp] = 1;
                    obj.models.push(branch_b);

                }

                y = y + 1;

            }
        }
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
