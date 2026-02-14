/**
 * @file src/external/main.ts
 * @description External solver integration hub
 *
 * Provides a unified interface for delegating to external solvers
 * (e.g., lp_solve). External solvers run as separate processes and
 * may offer better performance or features for specific problem types.
 *
 * Note: External solvers require Node.js and are not available in browsers.
 */
import lpsolve from "./lpsolve/main";
import type { Model as ModelDefinition } from "../types/solver";

/**
 * Interface for an external solver integration module.
 * Each module provides at least a `solve` method for delegating to an external process.
 */
export interface ExternalSolverModule {
    /** Convert a JSON model to the external solver's input format. */
    reformat?: (model: ModelDefinition) => unknown;
    /** Solve the model using the external solver process. */
    solve: (model: ModelDefinition) => Promise<unknown>;
}

/** Registry of available external solver modules keyed by solver name. */
export type ExternalSolvers = Record<string, ExternalSolverModule>;

const lpsolveSolver: ExternalSolverModule = lpsolve;

const External: ExternalSolvers = {
    lpsolve: lpsolveSolver,
};

export default External;
