export type ObjectiveDirection = "max" | "min";

export type ConstraintRelation = "min" | "max" | "equal";

export interface SolveOptions {
    tolerance?: number;
    timeout?: number;
    useMIRCuts?: boolean;
    exitOnCycles?: boolean;
    keep_solutions?: boolean;
    // Enhanced solver options
    nodeSelection?: 'best-first' | 'depth-first' | 'hybrid';
    branching?: 'most-fractional' | 'pseudocost' | 'strong';
    presolve?: boolean;
}

export interface ConstraintBound {
    min?: number;
    max?: number;
    equal?: number;
    weight?: number;
    priority?: number | "required" | "strong" | "medium" | "weak";
}

export interface VariableCoefficients {
    [constraintName: string]: number;
}

export interface Model {
    name?: string;
    optimize: string | Record<string, ObjectiveDirection>;
    opType?: ObjectiveDirection;
    constraints: Record<string, ConstraintBound | ConstraintRelation>;
    variables: Record<string, VariableCoefficients>;
    ints?: Record<string, boolean | 0 | 1>;
    binaries?: Record<string, boolean | 0 | 1>;
    unrestricted?: Record<string, boolean | 0 | 1>;
    tolerance?: number;
    timeout?: number;
    options?: SolveOptions;
    external?: {
        solver: string;
        [key: string]: unknown;
    };
}

export interface Variable {
    id: string;
    cost: number;
    index: number;
    value: number;
    priority: number;
    isInteger?: boolean;
    isSlack?: boolean;
}

export interface Term {
    variable: Variable;
    coefficient: number;
}

export interface Constraint {
    slack: Variable;
    index: number;
    model: unknown;
    rhs: number;
    isUpperBound: boolean;
    terms: Term[];
    termsByVarIndex: Record<number, Term>;
    relaxation: Variable | null;
}

export interface Numeral {
    value: number;
}

export interface SolveResult {
    feasible: boolean;
    result: number;
    bounded?: boolean;
    isIntegral?: boolean;
    [variable: string]: number | boolean | undefined;
}

// Re-export external solver types
export type { ExternalSolvers, ExternalSolverModule } from "../external/main";

// Convenience type for typed solution access
export type Solution<TVariable extends string = string> = SolveResult & Record<TVariable, number | undefined>;

// Full solver API type
export type SolverAPI = typeof import("../main").default;

// Alias for backwards compatibility
export type ModelDefinition = Model;
