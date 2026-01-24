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
