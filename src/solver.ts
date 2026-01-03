/**
 * jsLPSolver - Linear Programming and Mixed Integer Programming Solver
 *
 * Entry point for the solver library. Re-exports the main solver instance
 * and all public types for use by consumers.
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
    VariableCoefficients
} from "./types/solver";
