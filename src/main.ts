/**
 * @file src/main.ts
 * @description Core Solver class implementation
 *
 * Orchestrates the complete solving pipeline:
 * - Model parsing and validation
 * - Simplex algorithm for linear programming
 * - Branch-and-cut for mixed-integer programming
 * - Multi-objective optimization via Polyopt
 * - External solver delegation (e.g., lp_solve)
 */
import Tableau from "./tableau";
import Model from "./model";
import * as expressions from "./expressions";
import * as validation from "./validation";
import External from "./external/main";
import Polyopt from "./polyopt";
import ReformatLP from "./external/lpsolve/reformat";
import { createBranchAndCutService } from "./tableau/branch-and-cut";
import { createEnhancedBranchAndCutService } from "./tableau/enhanced-branch-and-cut";
import { createIncrementalBranchAndCutService } from "./tableau/incremental-branch-and-cut";
import type { Model as ModelDefinition, SolveResult } from "./types/solver";

// Global environment declarations for UMD compatibility
declare const define: ((deps: unknown[], factory: () => Solver) => void) | undefined;
declare const window: { solver?: Solver } | undefined;
declare const self: { solver?: Solver } | undefined;

type ValidationFn = (model: ModelDefinition) => ModelDefinition;

/**
 * Main solver class providing the public API for solving optimization problems.
 *
 * Typically used as a singleton (exported as `solver` from this module).
 * Orchestrates model parsing, validation, simplex/B&C solving, and
 * multi-objective optimization.
 *
 * @example
 * ```ts
 * import solver from "javascript-lp-solver";
 * const result = solver.Solve({ optimize: "profit", opType: "max", ... });
 * ```
 */
class Solver {
    /** Model class constructor for programmatic model building. */
    Model = Model;
    /** Tableau class constructor (advanced: for direct tableau manipulation). */
    Tableau = Tableau;
    /** Constraint class constructor. */
    Constraint = expressions.Constraint;
    /** Variable class constructor. */
    Variable = expressions.Variable;
    /** Numeral class constructor. */
    Numeral = expressions.Numeral;
    /** Term class constructor. */
    Term = expressions.Term;

    /** Registry of external solver integrations (e.g., lp_solve). */
    External = External;
    /** LP format conversion utility for external solvers. */
    ReformatLP = ReformatLP;

    /** Default branch-and-cut service instance. */
    branchAndCutService = createBranchAndCutService();
    /** Convenience method to run branch-and-cut on a tableau. */
    branchAndCut = (tableau: Tableau): void => this.branchAndCutService.branchAndCut(tableau);

    /** Reference to the most recently solved Model instance (useful for post-solve inspection). */
    lastSolvedModel: Model | null = null;

    /**
     * Select the appropriate branch-and-cut service based on model options.
     *
     * Enhanced strategies can be enabled via model.options:
     * - nodeSelection: 'best-first' | 'depth-first' | 'hybrid'
     * - branching: 'most-fractional' | 'pseudocost' | 'strong'
     * - useIncremental: true to use incremental state management (experimental)
     */
    private selectBranchAndCutService(model: ModelDefinition) {
        const options = model.options;
        const useEnhanced = options?.nodeSelection || options?.branching;
        const useIncremental = options?.useIncremental === true; // Must explicitly enable

        if (useIncremental) {
            return createIncrementalBranchAndCutService({
                nodeSelection: options?.nodeSelection ?? "hybrid",
                branching: options?.branching ?? "pseudocost",
            });
        }

        if (useEnhanced) {
            return createEnhancedBranchAndCutService({
                nodeSelection: options?.nodeSelection ?? "hybrid",
                branching: options?.branching ?? "pseudocost",
                useDiving: true,
            });
        }

        return createBranchAndCutService();
    }

    /**
     * Solve a linear or mixed-integer programming problem.
     *
     * @param model - Problem definition (JSON format or Model instance)
     * @param precision - Tolerance for integer constraints (default: 1e-9)
     * @param full - If true, return full Solution object; otherwise return simplified result
     * @param validate - If true, run model through validation functions
     * @returns Solution object or simplified result with variable values
     */
    Solve<_TVariable extends string = string>(
        model: ModelDefinition | Model,
        precision?: number,
        full?: boolean,
        validate?: boolean
    ): SolveResult | unknown {
        // Run validation if requested
        if (validate) {
            for (const test in validation) {
                const validator = (validation as Record<string, ValidationFn>)[test];
                if (typeof validator === "function") {
                    model = validator(model as ModelDefinition);
                }
            }
        }

        if (!model) {
            throw new Error("Solver requires a model to operate on");
        }

        // Handle multi-objective optimization
        if (typeof (model as ModelDefinition).optimize === "object") {
            if (Object.keys((model as ModelDefinition).optimize).length > 1) {
                return Polyopt(this, model as ModelDefinition);
            }
        }

        // Handle external solver delegation
        if ((model as ModelDefinition).external) {
            return this.solveWithExternalSolver(model as ModelDefinition);
        }

        // Solve with internal solver
        let modelInstance: Model;
        if (!(model instanceof Model)) {
            const branchAndCutService = this.selectBranchAndCutService(model as ModelDefinition);
            modelInstance = new Model(precision, undefined, branchAndCutService).loadJson(
                model as ModelDefinition
            );
        } else {
            modelInstance = model;
        }

        const solution = modelInstance.solve();
        this.lastSolvedModel = modelInstance;
        solution.solutionSet = solution.generateSolutionSet();

        // Return full solution or simplified result
        if (full) {
            return solution;
        }

        return this.buildSimplifiedResult(solution);
    }

    /**
     * Delegate solving to an external solver (e.g., lp_solve).
     */
    private solveWithExternalSolver(model: ModelDefinition): unknown {
        const solvers = Object.keys(External);
        const solverList = JSON.stringify(solvers);

        if (!model.external?.solver) {
            throw new Error(
                `Model has 'external' object without solver attribute. Available: ${solverList}`
            );
        }

        const requestedSolver = model.external.solver;
        if (!External[requestedSolver]) {
            throw new Error(`Solver '${requestedSolver}' not supported. Available: ${solverList}`);
        }

        return External[requestedSolver].solve(model);
    }

    /**
     * Build a simplified result object from a full solution.
     */
    private buildSimplifiedResult(solution: ReturnType<Model["solve"]>): SolveResult {
        const result: SolveResult = {
            feasible: solution.feasible,
            result: solution.evaluation,
            bounded: solution.bounded,
        };

        if (solution._tableau.__isIntegral) {
            result.isIntegral = true;
        }

        // Add non-zero variable values
        for (const varId of Object.keys(solution.solutionSet)) {
            const value = solution.solutionSet[varId];
            if (value !== 0) {
                result[varId] = value;
            }
        }

        return result;
    }

    /**
     * Solve a multi-objective optimization problem.
     *
     * Returns a compromise solution using the mid-point formula between
     * individually optimized objectives.
     *
     * @example
     * const model = {
     *     optimize: { profit: "max", risk: "min" },
     *     constraints: { budget: { max: 1000 } },
     *     variables: { ... }
     * };
     * const result = solver.MultiObjective(model);
     */
    MultiObjective(model: ModelDefinition): unknown {
        return Polyopt(this, model);
    }
}

// Create singleton instance
const solver = new Solver();

// UMD module exports for various environments
if (typeof define === "function") {
    // AMD (RequireJS)
    define([], () => solver);
} else if (typeof window === "object") {
    // Browser global
    window.solver = solver;
} else if (typeof self === "object") {
    // Web Worker
    self.solver = solver;
}

export default solver;
