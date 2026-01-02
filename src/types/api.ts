import type { ExternalSolvers, ExternalSolverModule } from "../external/main";
import type {
    Constraint,
    ConstraintBound,
    ConstraintRelation,
    Model as ModelDefinition,
    Numeral,
    ObjectiveDirection,
    SolveOptions,
    SolveResult,
    Term,
    Variable,
    VariableCoefficients
} from "./solver";

export type Solution<TVariable extends string = string> = SolveResult & Record<TVariable, number | undefined>;

export type SolverAPI = typeof import("../main").default;

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
};
