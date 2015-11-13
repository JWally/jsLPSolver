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
var expressions = require("./expressions.js");
var validation = require("./Validation");
var Constraint = expressions.Constraint;
var Variable = expressions.Variable;
var Numeral = expressions.Numeral;
var Term = expressions.Term;

// Place everything under the Solver Name Space
var Solver = function () {

    "use strict";

    this.Model = Model;
    this.MILP = MILP;
    this.Constraint = Constraint;
    this.Variable = Variable;
    this.Numeral = Numeral;
    this.Term = Term;
    this.Tableau = Tableau;

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
    this.Solve = function (model, precision, full, validate) {
        // Run our validations on the model
        // if the model doesn't have a validate
        // attribute set to false
        if(validate){
            for(var test in validation){
                model = validation[test](model);
            }        
        }



        // Make sure we at least have a model
        if (!model) {
            throw new Error("Solver requires a model to operate on");
        }

        if (model instanceof Model === false) {
            model = new Model(precision).loadJson(model);
        }

        var solution = model.solve();

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
     * Method: ReformatLP
     * Scope: Public:
     * Agruments: model: The model we want solver to operate on
     * Purpose: Convert a friendly JSON model into a model for a
     *          real solving library...in this case
     *          lp_solver
     **************************************************************/
    this.ReformatLP = require("./LP_Solve");


};

// Determine the environment we're in.
// if we're in node, offer a friendly exports
// otherwise, Solver's going global
/* jshint ignore:start */

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
