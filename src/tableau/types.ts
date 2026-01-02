import type MilpSolution from "./milp-solution";
import type Solution from "./solution";
import type { Variable } from "../expressions";
import type Model from "../model";

export type BoundType = "min" | "max";

export interface BranchCut {
    type: BoundType;
    varIndex: number;
    value: number;
}

export interface Branch {
    relaxedEvaluation: number;
    cuts: BranchCut[];
}

export interface OptionalObjective {
    priority: number;
    reducedCosts: number[];
    copy(): OptionalObjective;
}

export interface VariableValue {
    index: number | null;
    value: number | null;
}

export interface SavedState {
    width: number;
    height: number;
    nVars: number;
    model: Model | null;
    variables: Variable[];
    variablesPerIndex: Array<Variable | undefined>;
    unrestrictedVars: Record<number, boolean>;
    lastElementIndex: number;
    varIndexByRow: number[];
    varIndexByCol: number[];
    rowByVarIndex: number[];
    colByVarIndex: number[];
    availableIndexes: number[];
    optionalObjectives: OptionalObjective[];
    optionalObjectivePerPriority: Record<number, OptionalObjective>;
    matrix: number[][];
}

export type TableauSolution = Solution | MilpSolution;

export interface TableauSolutionSet {
    [variable: string]: number | undefined;
    result?: number;
}
