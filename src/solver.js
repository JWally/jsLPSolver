//-------------------------------------------------------------------
// SimplexJS
// https://github.com/
// An Object-Oriented Linear Programming Solver
//
// By Justin Wolcott (c)
// Licensed under the MIT License.
//-------------------------------------------------------------------


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
    obj.max = function (ary) {
        var i,
            tmp = -1e99,
            len = ary.length;

        for (i = 0; i < len; i++) {
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
    obj.min = function (ary) {
        var i,
            tmp = 1e99,
            len = ary.length;

        for (i = 0; i < len; i++) {
            tmp = ary[i] < tmp ? ary[i] : tmp;
        }
        return tmp;
    };

    //-------------------------------------------------------------------
    // Quick and dirty method to round numbers 
    //-------------------------------------------------------------------

    obj.round = function (num, precision) {
        return Math.round(num * Math.pow(10, precision - 0)) / (Math.pow(
            10,
            precision - 0));
    };

    //-------------------------------------------------------------------
    // Method to quickly transpose a 2d array
    //-------------------------------------------------------------------    
    obj.transpose = function (a) {
        return Object.keys(a[0]).map(function (c) {
            return a.map(function (r) {
                return r[c];
            });
        });
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
        for (i = 0; i < keys.length; i = i + 1) {
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
    // Function: spread
    // Puprose: creates a 1d Array of 'l' length filled with '0's except
    //          at position 'p' which becomes 'num'
    //
    // Example: obj.spread(5, 4, 1) === [0,0,0,0,1]
    //-------------------------------------------------------------------
    obj.spread = function (l, p, num) {
        return new Array(l).join().split(",").map(function (e, i) {
            return i === p ? num : 0;
        });
    };

    //-------------------------------------------------------------------
    // Function: slack
    // Purpose: Create the base tableau from a 2d Array of Variables
    //
    //          *note* The objective row is being pre populated with
    //          "0" values so we don't have to worry about creating
    //          it later
    //
    // Example: obj.slack([[1,2,3]
    //                    ,[4,5,6]])
    //          ==>
    //              [[0,1,2,3,1,0],
    //              [0,4,5,6,0,1],
    //              [1,0,0,0,0,0]]
    //
    //-------------------------------------------------------------------
    obj.slack = function (tbl) {
        var len = tbl.length,
            base,
            p,
            i;

        for (i = 0; i < len; i = i + 1) {
            base = i !== (len - 1) ? 1 : 0;
            p = i !== (len - 1) ? 0 : 1;

            tbl[i] = [p].concat(tbl[i].concat(this.spread(len, i, base)));
        }
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
        for (i = 0; i < width; i = i + 1) {
            tbl[row][i] = (tbl[row][i] / target);
        }


        // for every row EXCEPT the target row,
        // set the value in the target column = 0 by
        // multiplying the value of all elements in the objective
        // row by ... yuck... just look below; better explanation later
        //var a = new Date().getTime();
        for (i = 0; i < length; i = i + 1) {
            if (i !== row) {
                pivot_row = tbl[i][col];
                for (j = 0; j < width; j = j + 1) {
                    tbl[i][j] = ((-1 * pivot_row * tbl[row][j]) + tbl[i][j]);
                }
            }
        }
        //console.log(new Date().getTime() - a);
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
        var rhs = [],
            rhs_min,
            row,
            col,
            len = tbl[0].length - 1;

        // Push the values of the RHS into a 1d array
        for (var i = 0; i < tbl.length - 1; i++) {
            rhs.push(tbl[i][len]);
        }

        // Find the minimum of the RHS
        rhs_min = obj.min(rhs);

        // If nothing is less than 0; we're done with phase 1.
        if (rhs_min >= 0) {
            return true;
        } else {
            // The lowest point on the RHS will be our next
            // pivot row
            row = rhs.indexOf(rhs_min);
            // The Smallest negative entry in our next pivot
            // row will be the column we pivot on next
            col = obj.min(tbl[row].slice(0, -1));
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
            quotient,
            length = tbl.length,
            width = tbl[0].length,
            objRow,
            min,
            i,
            dividend;

        // Step 1. Identify the smallest entry in the objective row
        //         (the bottom)
        objRow = tbl[length - 1].slice(0, -1);
        min = obj.min(objRow);

        // Step 2a. If its non-negative, stop. A solution has been found
        if (min >= 0) {
            return true;
        } else {
            // Step 2b. Otherwise, we have our pivot column
            col = objRow.indexOf(min);

            // Step 3a. If all entries in the pivot column are <= 0;
            // stop. The solution is unbounded;

            quotient = [];
            for (i = 0; i < (length - 1); i = i + 1) {
                if (tbl[i][col] > 0.001) {
                    quotient.push((tbl[i][width - 1]) / (tbl[i][col]));
                } else {
                    quotient.push(1e99);
                }
            }
            dividend = obj.min(quotient);
            row = quotient.indexOf(dividend);

            if (dividend > -1 && dividend < 1e99) {
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
            test;

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
            results[tracker[i]] = tbl[i].slice(-1)[0];
        }

        // Tell me what the hell this is
        results.result = tbl.slice(-1)[0].slice(-1)[0];
        results.feasible = obj.min(obj
            .transpose(tbl)
            .slice(-1)[0]
            .slice(0, -1)
        ) > -0.001 ? true : false;

        return results;

    };

    //-------------------------------------------------------------------
    //Function: Solve
    //Detail: Main function, linear programming solver
    //-------------------------------------------------------------------
    obj.Solve = function (model) {

        var tableau = [], //The LHS of the Tableau
            rhs = [], //The RHS of the Tableau
            cstr = Object.keys(model.constraints), //Array with name of each constraint type
            vari = Object.keys(model.variables), //Array with name of each Variable
            opType = model.opType === "max" ? -1 : 1,
            hsh,
            len,
            z = 0,
            i,
            j,
            x,
            constraint,
            variable,
            rslts;

        //Give all of the variables a self property of 1
        for (variable in model.variables) {
            model.variables[variable][variable] = 1;
            //if a min or max exists in the variables;
            //add it to the constraints
            if (typeof model.variables[variable].max !== "undefined") {
                model.constraints[variable] = model.constraints[
                    variable] || {};
                model.constraints[variable].max = model.variables[
                        variable]
                    .max;
            }

            if (typeof model.variables[variable].min !== "undefined") {
                model.constraints[variable] = model.constraints[
                    variable] || {};
                model.constraints[variable].min = model.variables[
                        variable]
                    .min;
            }
        }

        cstr = Object.keys(model.constraints); //Array with name of each constraint type
        vari = Object.keys(model.variables); //Array with name of each Variable

        //Load up the RHS
        for (constraint in model.constraints) {
            if (typeof model.constraints[constraint].max !==
                "undefined") {
                tableau.push([]);
                rhs.push(model.constraints[constraint].max);
            }

            if (typeof model.constraints[constraint].min !==
                "undefined") {
                tableau.push([]);
                rhs.push(-model.constraints[constraint].min);
            }
        }

        //Load up the Tableau
        for (i = 0; i < cstr.length; i = i + 1) {
            constraint = cstr[i];

            if (typeof model.constraints[constraint].max !==
                "undefined") {
                for (j = 0; j < vari.length; j = j + 1) {
                    tableau[z][j] = typeof model.variables[vari[j]][
                            constraint
                        ] === "undefined" ? 0 : model.variables[vari[j]]
                        [
                            constraint
                        ];
                }
                z = z + 1;
            }

            if (typeof model.constraints[constraint].min !==
                "undefined") {
                for (j = 0; j < vari.length; j = j + 1) {
                    tableau[z][j] = typeof model.variables[vari[j]][
                            constraint
                        ] === "undefined" ? 0 : -model.variables[vari[j]]
                        [
                            constraint
                        ];
                }
                z = z + 1;
            }
        }



        //Add an array to the tableau for the Objective Function
        tableau.push([]);

        //Add the Objective Function
        for (j = 0; j < vari.length; j = j + 1) {
            tableau[tableau.length - 1][j] = typeof model.variables[
                    vari[j]]
                [model.optimize] === "undefined" ? 0 : opType * model.variables[
                    vari[j]][model.optimize];
        }

        //Add Slack Variables to the Tableau
        obj.slack(tableau);

        //Add on the Right Hand Side variables
        len = tableau[0].length;
        for (x in rhs) {
            tableau[x][len - 1] = rhs[x];
        }



        rslts = obj.optimize(tableau);
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
            if (obj.integral(model, solution, precision) && solution.feasible) {
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

            } else if (solution.feasible && solution.result * minmax >
                minmax * obj.best.result) {

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

                tmp = JSON.stringify(branch_a);
                if (!obj.priors[tmp]) {
                    obj.priors[tmp] = 1;
                    obj.models.push(branch_a);
                }

                iLow = Math.floor(solution[key]);
                branch_b = JSON.parse(JSON.stringify(model));
                branch_b.constraints[key] = branch_b.constraints[key] || {};
                branch_b.constraints[key].max = iLow || 0;


                tmp = JSON.stringify(branch_b);
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
