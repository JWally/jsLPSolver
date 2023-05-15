//-------------------------------------------------------------------
// SimplexJS
// https://github.com/
// An Object-Oriented Linear Programming Solver
//
// By Justin Wolcott (c)
// Licensed under the MIT License.
//-------------------------------------------------------------------

// import Tableau from "./Tableau/index.js";
import Model from "./Model.js";
import Polyopt from "./Polyopt.js";
import Reformat from "./External/lpsolve/Reformat.js";
// var branchAndCut = require("./Tableau/branchAndCut.js");
// import { Constraint, Variable, Numeral, Term } from "./Expressions.js";
import validatorList from "./Validation.js";
// import External from "./External/main.js";

// Place everything under the Solver Name Space
class Solver {

    constructor() {
        // this.Model = Model;
        // this.branchAndCut = branchAndCut;
        // this.Constraint = Constraint;
        // this.Variable = Variable;
        // this.Numeral = Numeral;
        // this.Term = Term;
        // this.Tableau = Tableau;
        this.lastSolvedModel = null;

        // this.External = External;
    }

    /*************************************************************
     * Method: Solve
     * Scope: Public:
     * Agruments:live
     *        model: The model we want solver to operate on
     *        precision: If we're solving a MILP, how tight
     *                   do we want to define an integer, given
     *                   that 20.000000000000001 is not an integer.
     *                   (defaults to 1e-9)
     *            full: *get better description*
     *        validate: if left blank, it will get ignored; otherwise
     *                  it will run the model through all validation
     *                  functions in the *Validate* module
     **************************************************************/
    Solve(model, precision, full, validate) {
        //
        // Run our validations on the model
        // if the model doesn't have a validate
        // attribute set to false
        //
        if (validate) {
            for (const test in validatorList) {
                model = validatorList[test](model);
            }
        }

        // Make sure we at least have a model
        if (!model) {
            throw new Error("Solver requires a model to operate on");
        }

        //
        // If the objective function contains multiple objectives,
        // pass it to the multi-solver thing...
        //
        if (typeof model.optimize === "object") {
            if (Object.keys(model.optimize > 1)) {
                return Polyopt(this, model);
            }
        }

        // /////////////////////////////////////////////////////////////////////
        // *********************************************************************
        // START
        // Try our hand at handling external solvers...
        // START
        // *********************************************************************
        // /////////////////////////////////////////////////////////////////////
        // Disable / Remove the External solvers for now.
        // if (model.external) {
        // eslint-disable-next-line no-constant-condition
        if (false) {

            //     var solvers = Object.keys(External);
            //     solvers = JSON.stringify(solvers);

            //     //
            //     // The model needs to have a "solver" attribute if nothing else
            //     // for us to pass data into
            //     //
            //     if (!model.external.solver) {
            //         throw new Error("The model you provided has an 'external' object that doesn't have a solver attribute. Use one of the following:" + solvers);
            //     }

            //     //
            //     // If the solver they request doesn't exist; provide them
            //     // with a list of possible options:
            //     //
            //     if (!External[model.external.solver]) {
            //         throw new Error("No support (yet) for " + model.external.solver + ". Please use one of these instead:" + solvers);
            //     }

            //     return External[model.external.solver].solve(model);


            //     // /////////////////////////////////////////////////////////////////////
            //     // *********************************************************************
            //     //  END
            //     // Try our hand at handling external solvers...
            //     //  END
            //     // *********************************************************************
            //     // /////////////////////////////////////////////////////////////////////

        } else {

            if (model instanceof Model === false) {
                model = new Model(precision).loadJson(model);
            }

            const solution = model.solve();
            this.lastSolvedModel = model;
            solution.solutionSet = solution.generateSolutionSet();

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

                store.bounded = solution.bounded;

                if (solution._tableau.__isIntegral) {
                    store.isIntegral = true;
                }

                // 3.) Load all of the variable values
                Object.keys(solution.solutionSet)
                    .forEach(function (d) {
                        //
                        // When returning data in standard format,
                        // Remove all 0's
                        //
                        if (solution.solutionSet[d] !== 0) {
                            store[d] = solution.solutionSet[d];
                        }

                    });

                return store;
            }

        }

    }

    /*************************************************************
     * Method: ReformatLP
     * Scope: Public:
     * Agruments: model: The model we want solver to operate on
     * Purpose: Convert a friendly JSON model into a model for a
     *          real solving library...in this case
     *          lp_solver
     **************************************************************/
    ReformatLP(model) {
        return Reformat(model);
    }


    /*************************************************************
    * Method: MultiObjective
    * Scope: Public:
    * Agruments:
    *        model: The model we want solver to operate on
    *        detail: if false, or undefined; it will return the
    *                result of using the mid-point formula; otherwise
    *                it will return an object containing:
    *
    *                1. The results from the mid point formula
    *                2. The solution for each objective solved
    *                   in isolation (pareto)
    *                3. The min and max of each variable along
    *                   the frontier of the polytope (ranges)
    * Purpose: Solve a model with multiple objective functions.
    *          Since a potential infinite number of solutions exist
    *          this naively returns the mid-point between
    *
    * Note: The model has to be changed a little to work with this.
    *       Before an *opType* was required. No more. The objective
    *       attribute of the model is now an object instead of a
    *       string.
    *
    *  *EXAMPLE MODEL*
    *
    *   model = {
    *       optimize: {scotch: "max", soda: "max"},
    *       constraints: {fluid: {equal: 100}},
    *       variables: {
    *           scotch: {fluid: 1, scotch: 1},
    *           soda: {fluid: 1, soda: 1}
    *       }
    *   }
    *
    **************************************************************/
    MultiObjective(model) {
        return Polyopt(this, model);
    }
}

// var define = define || undefined;
// var window = window || undefined;

// // If the project is loading through require.js, use `define` and exit
// if (typeof define === "function") {
//     define([], function () {
//         return new Solver();
//     });
//     // If the project doesn't see define, but sees window, put solver on window
// } else if (typeof window === "object") {
//     window.solver = new Solver();
// } else if (typeof self === "object") {
//     self.solver = new Solver();
// }
// Ensure that its available in node.js env
const solver = new Solver()
export default solver;
