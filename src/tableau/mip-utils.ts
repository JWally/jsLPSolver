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

/** Distance from a numeric value to its nearest integer. */
export function integerDistance(value: number): number {
    return Math.abs(value - Math.floor(value + 0.5));
}

// ========== Integer Property Functions ==========

/**
 * Count how many integer variables currently have integral values.
 * A value is considered integral if its distance to the nearest integer
 * is within the tableau's precision tolerance.
 *
 * @returns Number of integer variables with integral current values.
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
            if (integerDistance(value) < this.precision) {
                count += 1;
            }
        }
    }
    return count;
}

/**
 * Check if all integer variables have integral values within precision.
 *
 * @returns True if the current solution satisfies all integrality constraints.
 */
export function isIntegral(this: Tableau): boolean {
    const width = this.width;
    const matrix = this.matrix;
    const rhsColumn = this.rhsColumn;
    const integerVariables = this.model!.integerVariables;
    const nIntegerVars = integerVariables.length;
    // Cache array reference for faster access in hot loop
    const rowByVarIndex = this.rowByVarIndex;
    const precision = this.precision;

    for (let v = 0; v < nIntegerVars; v++) {
        const varIndex = integerVariables[v].index;
        const row = rowByVarIndex[varIndex];
        if (row !== -1) {
            const value = matrix[row * width + rhsColumn];
            if (integerDistance(value) > precision) {
                return false;
            }
        }
    }
    return true;
}

/**
 * Compute a measure of total fractionality across all integer variables.
 *
 * The "volume" is the product of fractional values. Used to evaluate cutting
 * plane effectiveness: a decreasing volume indicates the LP relaxation is
 * tightening toward integrality.
 *
 * @param ignoreIntegerValues - If true, skip already-integral variables (don't return 0 early).
 * @returns Product of fractional variable values, or 0 if all are integral.
 */
export function computeFractionalVolume(this: Tableau, ignoreIntegerValues?: boolean): number {
    let volume = -1;
    const width = this.width;
    const matrix = this.matrix;
    const rhsColumn = this.rhsColumn;
    const height = this.height;
    // Cache array references for faster access in hot loop
    const variablesPerIndex = this.variablesPerIndex;
    const varIndexByRow = this.varIndexByRow;
    const precision = this.precision;

    for (let r = 1; r < height; r += 1) {
        const variable = variablesPerIndex[varIndexByRow[r]];
        if (variable !== undefined && variable.isInteger) {
            const value = matrix[r * width + rhsColumn];
            const distance = Math.abs(value);
            if (Math.min(distance - Math.floor(distance), Math.floor(distance + 1)) < precision) {
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
 * Select the integer variable with the most fractional value for branching.
 *
 * This is the default branching strategy. Picks the variable whose current
 * value is farthest from the nearest integer (closest to 0.5 fractionality),
 * creating the most balanced branching.
 *
 * @returns The selected variable's index and value, or nulls if all are integral.
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
    // Cache array reference for faster access in hot loop
    const rowByVarIndex = this.rowByVarIndex;

    for (let v = 0; v < nIntegerVars; v += 1) {
        const varIndex = integerVars[v].index;
        const row = rowByVarIndex[varIndex];
        if (row !== -1) {
            const varValue = matrix[row * width + rhsColumn];
            const fraction = integerDistance(varValue);
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
 * Select the fractional integer variable with the lowest objective coefficient.
 *
 * Alternative branching strategy that prioritizes variables with less
 * objective impact, potentially leading to smaller objective degradation
 * in child nodes.
 *
 * @returns The selected variable's index and value, or nulls if all are integral.
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
            if (integerDistance(varValue) > this.precision && variable.cost < highestCost) {
                highestCost = variable.cost;
                selectedVarIndex = varIndex;
                selectedVarValue = varValue;
            }
        }
    }

    return { index: selectedVarIndex, value: selectedVarValue };
}
