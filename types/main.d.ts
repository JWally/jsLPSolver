import type {
    Constraint as ConstraintShape,
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
} from "../src/types/solver";

export type {
    ConstraintRelation,
    ModelDefinition as Model,
    Numeral,
    ObjectiveDirection,
    SolveOptions,
    SolveResult,
    Term,
    Variable,
    ConstraintShape as Constraint,
    ConstraintBound,
    VariableCoefficients
};

export interface Solution<TVariable extends string = string> extends SolveResult {
    [variable in TVariable]?: number;
}

export interface ExternalSolverModule {
    reformat?: (model: ModelDefinition) => unknown;
    solve: (model: ModelDefinition) => Promise<unknown>;
}

export type ExternalSolvers = Record<string, ExternalSolverModule>;

export type { ExternalSolvers, ExternalSolverModule };

export interface SolverAPI {
    Model: typeof import("../src/Model");
    branchAndCut: typeof import("../src/Tableau/branchAndCut");
    Constraint: typeof import("../src/expressions").Constraint;
    Variable: typeof import("../src/expressions").Variable;
    Numeral: Numeral;
    Term: typeof import("../src/expressions").Term;
    Tableau: typeof import("../src/Tableau/index");
    External: ExternalSolvers;
    lastSolvedModel: InstanceType<typeof import("../src/Model")> | null;
    Solve<TVariable extends string = string>(
        model: ModelDefinition,
        precision?: number,
        full?: boolean,
        validate?: boolean
    ): Solution<TVariable> | unknown;
    ReformatLP(model: string[] | ModelDefinition): ModelDefinition | string;
    MultiObjective(model: ModelDefinition): unknown;
}

declare const solver: SolverAPI;

export = solver;
export as namespace solver;
