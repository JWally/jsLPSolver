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

export interface ExternalSolverModule {
    reformat?: (model: ModelDefinition) => unknown;
    solve: (model: ModelDefinition) => Promise<unknown>;
}

export type ExternalSolvers = Record<string, ExternalSolverModule>;

const lpsolveSolver: ExternalSolverModule = lpsolve;

const External: ExternalSolvers = {
    lpsolve: lpsolveSolver,
};

export default External;
