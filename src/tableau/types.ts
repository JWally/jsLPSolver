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

/** Direction of a variable bound constraint: "min" for lower bound (x >= value), "max" for upper bound (x <= value). */
export type BoundType = "min" | "max";

/**
 * A bound constraint on a variable, used during branch-and-bound.
 * Each branch in the B&B tree is defined by a set of these cuts.
 */
export interface BranchCut {
    /** Whether this is a lower ("min") or upper ("max") bound. */
    type: BoundType;
    /** Internal index of the variable being bounded. */
    varIndex: number;
    /** The bound value (e.g., ceil(x) for "min" or floor(x) for "max"). */
    value: number;
}

/**
 * A node in the branch-and-bound tree.
 * Stores the LP relaxation value and all bound constraints that define this node.
 */
export interface Branch {
    /** Objective value of the LP relaxation at this node (used for best-first ordering). */
    relaxedEvaluation: number;
    /** Accumulated bound constraints from root to this node. */
    cuts: BranchCut[];
    /** Index of the variable that was branched on to create this node. */
    branchVarIndex?: number;
    /** Which direction the branch was taken ("up" = ceil, "down" = floor). */
    branchDirection?: "up" | "down";
    /** Fractionality of the branching variable at the parent node. */
    branchFractionality?: number;
    /** Parent node's objective value (for pseudocost computation). */
    parentEvaluation?: number;
}

/**
 * A secondary objective in hierarchical (priority-based) optimization.
 * Lower-priority objectives are optimized only after higher-priority ones are satisfied.
 */
export interface OptionalObjective {
    /** Priority level (lower number = higher priority, 0 = primary objective). */
    priority: number;
    /** Reduced costs for this objective across all columns. */
    reducedCosts: number[];
    /** Create an independent copy of this objective (for tableau backup). */
    copy(): OptionalObjective;
}

/**
 * Result of branching variable selection: the chosen variable's index and current value.
 * Null fields indicate no fractional variable was found (solution is integral).
 */
export interface VariableValue {
    /** Internal variable index, or null if no candidate found. */
    index: number | null;
    /** Current fractional value of the variable, or null. */
    value: number | null;
}

/** Union type for solutions from both continuous LP and mixed-integer problems. */
export type TableauSolution = Solution | MilpSolution;

/**
 * A flat map of variable IDs to their solution values.
 * Used as an intermediate format before constructing the final SolveResult.
 */
export interface TableauSolutionSet {
    /** Variable values keyed by variable ID. */
    [variable: string]: number | undefined;
    /** The objective function value for this solution. */
    result?: number;
}
