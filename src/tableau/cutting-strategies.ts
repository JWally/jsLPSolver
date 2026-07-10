/**
 * @file src/tableau/cutting-strategies.ts
 * @description Cutting plane strategies for MIP solving
 *
 * Implements various cutting plane methods to tighten LP relaxations:
 * - Gomory mixed-integer cuts from the simplex tableau
 * - Bound cuts for variable branching
 *
 * These cuts are dynamically added to the tableau during branch-and-cut
 * to eliminate fractional solutions without cutting off integer solutions.
 */
import type Tableau from "./tableau";
import { SlackVariable } from "../expressions";
import type { BranchCut } from "./types";

/**
 * Add bound constraints (cuts) to the tableau for branch-and-bound.
 *
 * Each cut adds a new row enforcing a variable bound (x >= value or x <= value).
 * The matrix is grown with 50% over-allocation to reduce reallocation frequency.
 * New slack variables are created for each added row.
 *
 * @param cutConstraints - Array of bound constraints to add.
 */
export function addCutConstraints(this: Tableau, cutConstraints: BranchCut[]): void {
    const nCutConstraints = cutConstraints.length;
    const height = this.height;
    const heightWithCuts = height + nCutConstraints;
    const width = this.width;
    const lastColumn = width - 1;

    // Grow the matrix to accommodate new rows (with over-allocation to reduce reallocation frequency)
    const oldMatrix = this.matrix;
    const newSize = heightWithCuts * width;
    if (oldMatrix.length < newSize) {
        // Over-allocate by 50% to reduce future reallocations
        const allocSize = Math.ceil(newSize * 1.5);
        const newMatrix = new Float64Array(allocSize);
        newMatrix.set(oldMatrix);
        this.matrix = newMatrix;
    }
    const matrix = this.matrix;

    this.height = heightWithCuts;
    this.nVars = this.width + this.height - 2;

    // Cache array references for faster access in loop
    const rhsColumn = this.rhsColumn;
    const rowByVarIndex = this.rowByVarIndex;
    const colByVarIndex = this.colByVarIndex;
    const varIndexByRow = this.varIndexByRow;
    const variablesPerIndex = this.variablesPerIndex;

    for (let h = 0; h < nCutConstraints; h += 1) {
        const cut = cutConstraints[h];
        const cutRow = height + h;
        const cutRowOffset = cutRow * width;
        const sign = cut.type === "min" ? -1 : 1;

        const varIndex = cut.varIndex;
        let varRowIndex = rowByVarIndex[varIndex];

        if (varRowIndex === -1) {
            matrix[cutRowOffset + rhsColumn] = sign * cut.value;

            matrix.fill(0, cutRowOffset + 1, cutRowOffset + width);

            matrix[cutRowOffset + colByVarIndex[varIndex]] = sign;
        } else {
            const varRowOffset = varRowIndex * width;
            const varValue = matrix[varRowOffset + rhsColumn];

            matrix[cutRowOffset + rhsColumn] = sign * (cut.value - varValue);

            for (let c = 1; c <= lastColumn; c += 1) {
                matrix[cutRowOffset + c] = -sign * matrix[varRowOffset + c];
            }
        }

        varRowIndex = this.getNewElementIndex();
        varIndexByRow[cutRow] = varRowIndex;
        rowByVarIndex[varRowIndex] = cutRow;
        colByVarIndex[varRowIndex] = -1;
        variablesPerIndex[varRowIndex] = new SlackVariable("s" + varRowIndex, varRowIndex);

        this.nVars += 1;
    }
}

/**
 * Add a lower-bound Mixed Integer Rounding (MIR) cut from the given row.
 *
 * Generates a Gomory-style cut that is valid for integer solutions but
 * removes the current fractional LP relaxation point. The cut coefficients
 * are derived from the fractional parts of the tableau row.
 *
 * @param rowIndex - Row of the fractional integer variable to cut on.
 * @returns True if a cut was successfully added, false if the row is unsuitable.
 */
export function addLowerBoundMIRCut(this: Tableau, rowIndex: number): boolean {
    if (rowIndex === this.costRowIndex) {
        return false;
    }

    const width = this.width;
    const matrix = this.matrix;
    const cutRowOffset = rowIndex * width;
    const integerVar = this.variablesPerIndex[this.varIndexByRow[rowIndex]];
    if (integerVar === undefined || !integerVar.isInteger) {
        return false;
    }

    const rhsValue = matrix[cutRowOffset + this.rhsColumn];
    const fractionalPart = rhsValue - Math.floor(rhsValue);
    if (fractionalPart < this.precision || fractionalPart > 1 - this.precision) {
        return false;
    }

    const height = this.height;
    const newRowOffset = height * width;

    // Grow matrix to add new row (with over-allocation to reduce reallocation frequency)
    const newSize = (height + 1) * width;
    if (matrix.length < newSize) {
        // Over-allocate by 50% to reduce future reallocations
        const allocSize = Math.ceil(newSize * 1.5);
        const newMatrix = new Float64Array(allocSize);
        newMatrix.set(matrix);
        this.matrix = newMatrix;
    }
    const mat = this.matrix;

    this.height += 1;
    this.nVars += 1;

    const slackVarIndex = this.getNewElementIndex();
    this.varIndexByRow[height] = slackVarIndex;
    this.rowByVarIndex[slackVarIndex] = height;
    this.colByVarIndex[slackVarIndex] = -1;
    this.variablesPerIndex[slackVarIndex] = new SlackVariable("s" + slackVarIndex, slackVarIndex);

    const rhsColumn = this.rhsColumn;
    mat[newRowOffset + rhsColumn] = Math.floor(rhsValue);

    // Cache array references for faster access in hot loop
    const variablesPerIndex = this.variablesPerIndex;
    const varIndexByCol = this.varIndexByCol;
    const varIndexByColLen = varIndexByCol.length;
    const oneMinusFrac = 1 - fractionalPart;

    for (let colIndex = 1; colIndex < varIndexByColLen; colIndex += 1) {
        const variable = variablesPerIndex[varIndexByCol[colIndex]];
        const coefficient = mat[cutRowOffset + colIndex];
        if (variable !== undefined && variable.isInteger) {
            const floorCoeff = Math.floor(coefficient);
            const termCoeff =
                floorCoeff + Math.max(0, coefficient - floorCoeff - fractionalPart) / oneMinusFrac;
            mat[newRowOffset + colIndex] = termCoeff;
        } else {
            mat[newRowOffset + colIndex] = Math.min(0, coefficient / oneMinusFrac);
        }
    }

    for (let c = 0; c < width; c += 1) {
        mat[newRowOffset + c] -= mat[cutRowOffset + c];
    }

    return true;
}

/**
 * Add an upper-bound Mixed Integer Rounding (MIR) cut from the given row.
 *
 * Similar to addLowerBoundMIRCut but derives coefficients for the complementary
 * direction. Effective when the fractional variable is closer to its ceiling.
 *
 * @param rowIndex - Row of the fractional integer variable to cut on.
 * @returns True if a cut was successfully added, false if the row is unsuitable.
 */
export function addUpperBoundMIRCut(this: Tableau, rowIndex: number): boolean {
    if (rowIndex === this.costRowIndex) {
        return false;
    }

    const width = this.width;
    const matrix = this.matrix;
    const cutRowOffset = rowIndex * width;
    const integerVar = this.variablesPerIndex[this.varIndexByRow[rowIndex]];
    if (integerVar === undefined || !integerVar.isInteger) {
        return false;
    }

    const rhsValue = matrix[cutRowOffset + this.rhsColumn];
    const fractionalPart = rhsValue - Math.floor(rhsValue);
    if (fractionalPart < this.precision || fractionalPart > 1 - this.precision) {
        return false;
    }

    const height = this.height;
    const newRowOffset = height * width;

    // Grow matrix to add new row (with over-allocation to reduce reallocation frequency)
    const newSize = (height + 1) * width;
    if (matrix.length < newSize) {
        // Over-allocate by 50% to reduce future reallocations
        const allocSize = Math.ceil(newSize * 1.5);
        const newMatrix = new Float64Array(allocSize);
        newMatrix.set(matrix);
        this.matrix = newMatrix;
    }
    const mat = this.matrix;

    this.height += 1;
    this.nVars += 1;

    const slackVarIndex = this.getNewElementIndex();
    this.varIndexByRow[height] = slackVarIndex;
    this.rowByVarIndex[slackVarIndex] = height;
    this.colByVarIndex[slackVarIndex] = -1;
    this.variablesPerIndex[slackVarIndex] = new SlackVariable("s" + slackVarIndex, slackVarIndex);

    const rhsColumn = this.rhsColumn;
    mat[newRowOffset + rhsColumn] = -fractionalPart;

    // Cache array references for faster access in hot loop
    const variablesPerIndex = this.variablesPerIndex;
    const varIndexByCol = this.varIndexByCol;
    const varIndexByColLen = varIndexByCol.length;
    const oneMinusFrac = 1 - fractionalPart;

    for (let colIndex = 1; colIndex < varIndexByColLen; colIndex += 1) {
        const variable = variablesPerIndex[varIndexByCol[colIndex]];
        const coefficient = mat[cutRowOffset + colIndex];
        const termCoeff = coefficient - Math.floor(coefficient);
        if (variable !== undefined && variable.isInteger) {
            mat[newRowOffset + colIndex] =
                termCoeff <= fractionalPart
                    ? -termCoeff
                    : (-(1 - termCoeff) * fractionalPart) / termCoeff;
        } else {
            mat[newRowOffset + colIndex] =
                coefficient >= 0 ? -coefficient : (coefficient * fractionalPart) / oneMinusFrac;
        }
    }

    return true;
}

/**
 * Apply MIR cuts to all rows with fractional integer basic variables.
 *
 * Iterates through constraint rows, adding lower-bound MIR cuts where
 * applicable. Limited to 10 cuts per call to avoid excessive tableau growth.
 */
export function applyMIRCuts(this: Tableau): void {
    const height = this.height;
    let cutsAdded = 0;
    const maxCuts = 10; // Limit cuts per iteration to avoid excessive growth

    for (let r = 1; r < height && cutsAdded < maxCuts; r++) {
        // Try lower bound MIR cut first (typically more effective)
        if (this.addLowerBoundMIRCut(r)) {
            cutsAdded++;
        }
    }
}
