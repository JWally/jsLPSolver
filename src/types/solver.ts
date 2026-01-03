export type ObjectiveDirection = "max" | "min";

export type ConstraintRelation = "min" | "max" | "equal";

export interface SolveOptions {
    tolerance?: number;
    timeout?: number;
    useMIRCuts?: boolean;
    exitOnCycles?: boolean;
    keep_solutions?: boolean;
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
