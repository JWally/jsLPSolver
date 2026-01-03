import Tableau from "./tableau";
import Model from "./model";
import * as expressions from "./expressions";
import * as validation from "./validation";
import External from "./external/main";
import Polyopt from "./polyopt";
import ReformatLP from "./external/lpsolve/reformat";
import { createBranchAndCutService } from "./tableau/branch-and-cut";
import { createEnhancedBranchAndCutService } from "./tableau/enhanced-branch-and-cut";
import type { Model as ModelDefinition, SolveResult, SolveOptions } from "./types/solver";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
declare const define: ((deps: unknown[], factory: () => Solver) => void) | undefined;
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
declare const window: { solver?: Solver } | undefined;
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
declare const self: { solver?: Solver } | undefined;

type ValidationFn = (model: ModelDefinition) => ModelDefinition;

class Solver {
    Model = Model;
    branchAndCutService = createBranchAndCutService();
    branchAndCut = (tableau: Tableau): void => this.branchAndCutService.branchAndCut(tableau);
    Constraint = expressions.Constraint;
    Variable = expressions.Variable;
    Numeral = expressions.Numeral;
    Term = expressions.Term;
    Tableau = Tableau;
    lastSolvedModel: Model | null = null;

    External = External;

    /**
     * Select the appropriate branch-and-cut service based on options and problem structure.
     *
     * Users can enable enhanced strategies via model.options:
     * - nodeSelection: 'best-first' | 'depth-first' | 'hybrid'
     * - branching: 'most-fractional' | 'pseudocost' | 'strong'
     */
    private selectBranchAndCutService(model: ModelDefinition) {
        const options = model.options;

        // Only use enhanced service when explicitly requested
        const useEnhanced = options?.nodeSelection ||
                           options?.branching;

        if (useEnhanced) {
            return createEnhancedBranchAndCutService({
                nodeSelection: options?.nodeSelection ?? 'hybrid',
                branching: options?.branching ?? 'pseudocost',
                useDiving: true
            });
        }

        // Default to standard service (with heap optimization)
        return createBranchAndCutService();
    }

    /*************************************************************
     * Method: Solve
     * Scope: Public:
     * Agruments:
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
    Solve<TVariable extends string = string>(
        model: ModelDefinition | Model,
        precision?: number,
        full?: boolean,
        validate?: boolean
    ): SolveResult | unknown {
        //
        // Run our validations on the model
        // if the model doesn't have a validate
        // attribute set to false
        //
        if (validate) {
            for (const test in validation) {
                const validator = (validation as Record<string, ValidationFn>)[test];
                if (typeof validator === "function") {
                    model = validator(model as ModelDefinition);
                }
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
        if (typeof (model as ModelDefinition).optimize === "object") {
            if (Object.keys((model as ModelDefinition).optimize).length > 1) {
                return Polyopt(this, model as ModelDefinition);
            }
        }

        // /////////////////////////////////////////////////////////////////////
        // *********************************************************************
        // START
        // Try our hand at handling external solvers...
        // START
        // *********************************************************************
        // /////////////////////////////////////////////////////////////////////
        if ((model as ModelDefinition).external) {
            const solvers = Object.keys(External);
            const solverList = JSON.stringify(solvers);

            //
            // The model needs to have a "solver" attribute if nothing else
            // for us to pass data into
            //
            if (!(model as ModelDefinition).external?.solver) {
                throw new Error(
                    "The model you provided has an 'external' object that doesn't have a solver attribute. Use one of the following:" +
                    solverList
                );
            }

            //
            // If the solver they request doesn't exist; provide them
            // with a list of possible options:
            //
            const requestedSolver = (model as ModelDefinition).external?.solver as string;
            if (!External[requestedSolver]) {
                throw new Error(
                    "No support (yet) for " +
                    requestedSolver +
                    ". Please use one of these instead:" +
                    solverList
                );
            }

            return External[requestedSolver].solve(model as ModelDefinition);

        // /////////////////////////////////////////////////////////////////////
        // *********************************************************************
        //  END
        // Try our hand at handling external solvers...
        //  END
        // *********************************************************************
        // /////////////////////////////////////////////////////////////////////
        }

        let modelInstance: Model;
        if (model instanceof Model === false) {
            // Select appropriate branch-and-cut service based on problem
            const branchAndCutService = this.selectBranchAndCutService(model as ModelDefinition);
            modelInstance = new Model(precision, undefined, branchAndCutService).loadJson(model as ModelDefinition);
        } else {
            modelInstance = model as Model;
        }

        const solution = modelInstance.solve();
        this.lastSolvedModel = modelInstance;
        solution.solutionSet = solution.generateSolutionSet();

        // If the user asks for a full breakdown
        // of the tableau (e.g. full === true)
        // this will return it
        if (full) {
            return solution;
        } else {
            // Otherwise; give the user the bare
            // minimum of info necessary to carry on

            const store: SolveResult = {
                feasible: solution.feasible,
                result: solution.evaluation,
                bounded: solution.bounded
            };

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

    /*************************************************************
     * Method: ReformatLP
     * Scope: Public:
     * Agruments: model: The model we want solver to operate on
     * Purpose: Convert a friendly JSON model into a model for a
     *          real solving library...in this case
     *          lp_solver
     **************************************************************/
    ReformatLP = ReformatLP;

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
    MultiObjective(model: ModelDefinition): unknown {
        return Polyopt(this, model);
    }
}

const solver = new Solver();

// If the project is loading through require.js, use `define` and exit
if (typeof define === "function") {
    define([], function () {
        return solver;
    });
// If the project doesn't see define, but sees window, put solver on window
} else if (typeof window === "object") {
    window.solver = solver;
} else if (typeof self === "object") {
    self.solver = solver;
}
// Ensure that its available in node.js env

export default solver;
