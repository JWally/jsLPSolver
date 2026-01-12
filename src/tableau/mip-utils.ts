/**
 * @file src/tableau/mip-utils.ts
 * @description Mixed-integer programming utility functions
 *
 * Provides helper functions for MIP solving:
 * - Checking integrality of current solution
 * - Variable selection for branching (most fractional, etc.)
 * - Fractional volume computation
 *
 * Functions are designed to be bound to a Tableau instance via `this`.
 */
import type Tableau from "./tableau";
import type { VariableValue } from "./types";

// ========== Pseudo-Cost Branching ==========

/**
 * Pseudo-cost tracker for intelligent variable selection in branch-and-bound.
 *
 * Tracks the historical change in objective function when branching on each
 * integer variable. Uses this history to predict which variable will have
 * the most impact on the objective, reducing the size of the B&B tree.
 *
 * Based on: "Branching rules revisited" by Achterberg, Koch, Martin (2005)
 */
export interface PseudoCosts {
    // Pseudo-cost for rounding down: avg obj change per unit decrease
    down: Map<number, { sum: number; count: number }>;
    // Pseudo-cost for rounding up: avg obj change per unit increase
    up: Map<number, { sum: number; count: number }>;
    // Default pseudo-cost for uninitialized variables
    defaultCost: number;
}

export function createPseudoCosts(): PseudoCosts {
    return {
        down: new Map(),
        up: new Map(),
        defaultCost: 1.0,
    };
}

/**
 * Update pseudo-costs after a branching decision.
 * Call this after solving a child node to record the objective change.
 */
export function updatePseudoCost(
    pc: PseudoCosts,
    varIndex: number,
    direction: "up" | "down",
    fractionality: number,
    objectiveChange: number
): void {
    if (fractionality < 1e-10) return; // Avoid division by near-zero

    const costPerUnit = Math.abs(objectiveChange) / fractionality;
    const map = direction === "up" ? pc.up : pc.down;

    const existing = map.get(varIndex);
    if (existing) {
        existing.sum += costPerUnit;
        existing.count += 1;
    } else {
        map.set(varIndex, { sum: costPerUnit, count: 1 });
    }
}

/**
 * Get the pseudo-cost for a variable in a given direction.
 */
export function getPseudoCost(pc: PseudoCosts, varIndex: number, direction: "up" | "down"): number {
    const map = direction === "up" ? pc.up : pc.down;
    const data = map.get(varIndex);
    if (data && data.count > 0) {
        return data.sum / data.count;
    }
    return pc.defaultCost;
}

/**
 * Select branching variable using pseudo-cost branching.
 * Uses the product scoring rule: score = f_down * pc_down * f_up * pc_up
 * This balances the improvement from both branches.
 */
export function getPseudoCostBranchingVar(tableau: Tableau, pc: PseudoCosts): VariableValue {
    let bestScore = -Infinity;
    let selectedVarIndex: number | null = null;
    let selectedVarValue = 0;

    const width = tableau.width;
    const matrix = tableau.matrix;
    const rhsColumn = tableau.rhsColumn;
    const rowByVarIndex = tableau.rowByVarIndex;
    const integerVars = tableau.model!.integerVariables;
    const nIntegerVars = integerVars.length;
    const precision = tableau.precision;
    const epsilon = 1e-6; // Minimum score component

    for (let v = 0; v < nIntegerVars; v += 1) {
        const varIndex = integerVars[v].index;
        const row = rowByVarIndex[varIndex];
        if (row !== -1) {
            const varValue = matrix[row * width + rhsColumn];
            const floorVal = Math.floor(varValue);
            const fracDown = varValue - floorVal; // Distance to floor
            const fracUp = 1 - fracDown; // Distance to ceil

            // Skip if already integral
            if (fracDown < precision || fracUp < precision) {
                continue;
            }

            const pcDown = getPseudoCost(pc, varIndex, "down");
            const pcUp = getPseudoCost(pc, varIndex, "up");

            // Product scoring: emphasizes variables that improve both branches
            const scoreDown = Math.max(epsilon, fracDown * pcDown);
            const scoreUp = Math.max(epsilon, fracUp * pcUp);
            const score = scoreDown * scoreUp;

            if (score > bestScore) {
                bestScore = score;
                selectedVarIndex = varIndex;
                selectedVarValue = varValue;
            }
        }
    }

    return { index: selectedVarIndex, value: selectedVarValue };
}

// ========== Integer Property Functions ==========

/**
 * Count how many integer variables currently have integral values.
 */
export function countIntegerValues(this: Tableau): number {
    let count = 0;
    const width = this.width;
    const matrix = this.matrix;
    const rhsColumn = this.rhsColumn;

    for (let r = 1; r < this.height; r += 1) {
        const variable = this.variablesPerIndex[this.varIndexByRow[r]];
        if (variable !== undefined && variable.isInteger) {
            const value = matrix[r * width + rhsColumn];
            const decimalPart = value - Math.floor(value);
            if (decimalPart < this.precision && -decimalPart < this.precision) {
                count += 1;
            }
        }
    }
    return count;
}

/**
 * Check if all integer variables have integral values.
 * Returns true if the current solution is integral.
 */
export function isIntegral(this: Tableau): boolean {
    const width = this.width;
    const matrix = this.matrix;
    const rhsColumn = this.rhsColumn;
    const integerVariables = this.model!.integerVariables;
    const nIntegerVars = integerVariables.length;

    for (let v = 0; v < nIntegerVars; v++) {
        const varIndex = integerVariables[v].index;
        const row = this.rowByVarIndex[varIndex];
        if (row !== -1) {
            const value = matrix[row * width + rhsColumn];
            if (Math.abs(value - Math.round(value)) > this.precision) {
                return false;
            }
        }
    }
    return true;
}

/**
 * Compute a measure of how fractional the current solution is.
 * Used for evaluating the quality of cutting planes.
 */
export function computeFractionalVolume(this: Tableau, ignoreIntegerValues?: boolean): number {
    let volume = -1;
    const width = this.width;
    const matrix = this.matrix;
    const rhsColumn = this.rhsColumn;

    for (let r = 1; r < this.height; r += 1) {
        const variable = this.variablesPerIndex[this.varIndexByRow[r]];
        if (variable !== undefined && variable.isInteger) {
            const value = matrix[r * width + rhsColumn];
            const distance = Math.abs(value);
            if (
                Math.min(distance - Math.floor(distance), Math.floor(distance + 1)) < this.precision
            ) {
                if (ignoreIntegerValues !== true) {
                    return 0;
                }
            } else if (volume === -1) {
                volume = distance;
            } else {
                volume *= distance;
            }
        }
    }
    return volume === -1 ? 0 : volume;
}

// ========== Branching Variable Selection ==========

/**
 * Select the integer variable with the most fractional value.
 * Standard branching strategy - picks the variable closest to 0.5 fractionality.
 */
export function getMostFractionalVar(this: Tableau): VariableValue {
    let biggestFraction = 0;
    let selectedVarIndex: number | null = null;
    let selectedVarValue = 0;

    const width = this.width;
    const matrix = this.matrix;
    const rhsColumn = this.rhsColumn;
    const integerVars = this.model!.integerVariables;
    const nIntegerVars = integerVars.length;

    for (let v = 0; v < nIntegerVars; v += 1) {
        const varIndex = integerVars[v].index;
        const row = this.rowByVarIndex[varIndex];
        if (row !== -1) {
            const varValue = matrix[row * width + rhsColumn];
            const fraction = Math.abs(varValue - Math.round(varValue));
            if (fraction > biggestFraction) {
                biggestFraction = fraction;
                selectedVarIndex = varIndex;
                selectedVarValue = varValue;
            }
        }
    }

    return { index: selectedVarIndex, value: selectedVarValue };
}

/**
 * Select the fractional integer variable with the lowest cost coefficient.
 * Alternative branching strategy that considers objective function impact.
 */
export function getFractionalVarWithLowestCost(this: Tableau): VariableValue {
    let highestCost = Infinity;
    let selectedVarIndex: number | null = null;
    let selectedVarValue: number | null = null;

    const width = this.width;
    const matrix = this.matrix;
    const rhsColumn = this.rhsColumn;
    const integerVars = this.model!.integerVariables;
    const nIntegerVars = integerVars.length;

    for (let v = 0; v < nIntegerVars; v += 1) {
        const variable = integerVars[v];
        const varIndex = variable.index;
        const varRow = this.rowByVarIndex[varIndex];
        if (varRow !== -1) {
            const varValue = matrix[varRow * width + rhsColumn];
            if (
                Math.abs(varValue - Math.round(varValue)) > this.precision &&
                variable.cost < highestCost
            ) {
                highestCost = variable.cost;
                selectedVarIndex = varIndex;
                selectedVarValue = varValue;
            }
        }
    }

    return { index: selectedVarIndex, value: selectedVarValue };
}
