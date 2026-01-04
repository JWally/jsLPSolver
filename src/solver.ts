/**
 * @file src/solver.ts
 * @description Main entry point for jsLPSolver library
 *
 * Re-exports the solver instance and all public types. This is the primary
 * import target for library consumers.
 *
 * @example
 * import solver from "javascript-lp-solver";
 * const result = solver.Solve(model);
 */
import solver from "./main";

export default solver;

// Re-export all public types
export type {
    Constraint,
    ConstraintBound,
    ConstraintRelation,
    ExternalSolvers,
    ExternalSolverModule,
    Model,
    ModelDefinition,
    Numeral,
    ObjectiveDirection,
    Solution,
    SolveOptions,
    SolveResult,
    SolverAPI,
    Term,
    Variable,
    VariableCoefficients,
} from "./types/solver";
