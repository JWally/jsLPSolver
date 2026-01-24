/**
 * @file src/tableau/types.ts
 * @description Internal type definitions for the tableau module
 *
 * Defines types used within the tableau implementation:
 * - BranchCut: Bound constraint for MIP branching
 * - Branch: Node in the branch-and-bound tree
 * - OptionalObjective: Secondary objective for hierarchical optimization
 */
import type { Solution, MilpSolution } from "./solution";

export type BoundType = "min" | "max";

export interface BranchCut {
    type: BoundType;
    varIndex: number;
    value: number;
}

export interface Branch {
    relaxedEvaluation: number;
    cuts: BranchCut[];
    // For pseudo-cost tracking (optional)
    branchVarIndex?: number;
    branchDirection?: "up" | "down";
    branchFractionality?: number;
    parentEvaluation?: number;
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

export type TableauSolution = Solution | MilpSolution;

export interface TableauSolutionSet {
    [variable: string]: number | undefined;
    result?: number;
}
