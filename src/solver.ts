import solver from "./main";

export default solver;

export type { SolverAPI, Solution } from "./types/api";
export type {
    Constraint,
    ConstraintBound,
    ConstraintRelation,
    ExternalSolvers,
    ExternalSolverModule,
    ModelDefinition,
    Numeral,
    ObjectiveDirection,
    SolveOptions,
    SolveResult,
    Term,
    Variable,
    VariableCoefficients
} from "./types/api";
