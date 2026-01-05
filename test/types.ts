import type {
    ConstraintBound,
    ConstraintRelation,
    Model as ModelDefinition,
    VariableCoefficients,
} from "../src/types/solver";

export type ConstraintShape = ConstraintBound | ConstraintRelation;

export interface ProblemExpectations {
    feasible: boolean;
    result: number | string;
    bounded?: boolean;
    isIntegral?: boolean;
    _timeout?: number;
    [key: string]: number | boolean | string | undefined;
}

export interface TestModel extends ModelDefinition {
    name: string;
    background?: string;
    constraints: Record<string, ConstraintShape>;
    variables: Record<string, VariableCoefficients>;
    expects: ProblemExpectations;
}
