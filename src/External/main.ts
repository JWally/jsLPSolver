import lpsolve from "./lpsolve/main";
import type { Model as ModelDefinition } from "../types/solver";

export interface ExternalSolverModule {
    reformat?: (model: ModelDefinition) => unknown;
    solve: (model: ModelDefinition) => Promise<unknown>;
}

export type ExternalSolvers = Record<string, ExternalSolverModule>;

const lpsolveSolver: ExternalSolverModule = lpsolve;

const External: ExternalSolvers = {
    lpsolve: lpsolveSolver
};

export default External;
