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
        module.exports =  new Solver();
    }   
})()

/* jshint ignore:end */
