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

export function addCutConstraints(this: Tableau, cutConstraints: BranchCut[]): void {
    const nCutConstraints = cutConstraints.length;
    const height = this.height;
    const heightWithCuts = height + nCutConstraints;
    const width = this.width;
    const lastColumn = width - 1;

    // Grow the matrix to accommodate new rows
    const oldMatrix = this.matrix;
    const newSize = heightWithCuts * width;
    if (oldMatrix.length < newSize) {
        const newMatrix = new Float64Array(newSize);
        newMatrix.set(oldMatrix);
        this.matrix = newMatrix;
    }
    const matrix = this.matrix;

    this.height = heightWithCuts;
    this.nVars = this.width + this.height - 2;

    for (let h = 0; h < nCutConstraints; h += 1) {
        const cut = cutConstraints[h];
        const cutRow = height + h;
        const cutRowOffset = cutRow * width;
        const sign = cut.type === "min" ? -1 : 1;

        const varIndex = cut.varIndex;
        let varRowIndex = this.rowByVarIndex[varIndex];

        if (varRowIndex === -1) {
            matrix[cutRowOffset + this.rhsColumn] = sign * cut.value;

            for (let c = 1; c <= lastColumn; c += 1) {
                matrix[cutRowOffset + c] = 0;
            }

            matrix[cutRowOffset + this.colByVarIndex[varIndex]] = sign;
        } else {
            const varRowOffset = varRowIndex * width;
            const varValue = matrix[varRowOffset + this.rhsColumn];

            matrix[cutRowOffset + this.rhsColumn] = sign * (cut.value - varValue);

            for (let c = 1; c <= lastColumn; c += 1) {
                matrix[cutRowOffset + c] = -sign * matrix[varRowOffset + c];
            }
        }

        varRowIndex = this.getNewElementIndex();
        this.varIndexByRow[cutRow] = varRowIndex;
        this.rowByVarIndex[varRowIndex] = cutRow;
        this.colByVarIndex[varRowIndex] = -1;
        this.variablesPerIndex[varRowIndex] = new SlackVariable("s" + varRowIndex, varRowIndex);

        this.nVars += 1;
    }
}

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

    // Grow matrix to add new row
    const newSize = (height + 1) * width;
    if (matrix.length < newSize) {
        const newMatrix = new Float64Array(newSize);
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

    mat[newRowOffset + this.rhsColumn] = Math.floor(rhsValue);

    for (let colIndex = 1; colIndex < this.varIndexByCol.length; colIndex += 1) {
        const variable = this.variablesPerIndex[this.varIndexByCol[colIndex]];
        const coefficient = mat[cutRowOffset + colIndex];
        if (variable !== undefined && variable.isInteger) {
            const termCoeff =
                Math.floor(coefficient) +
                Math.max(0, coefficient - Math.floor(coefficient) - fractionalPart) /
                    (1 - fractionalPart);
            mat[newRowOffset + colIndex] = termCoeff;
        } else {
            mat[newRowOffset + colIndex] = Math.min(0, coefficient / (1 - fractionalPart));
        }
    }

    for (let c = 0; c < width; c += 1) {
        mat[newRowOffset + c] -= mat[cutRowOffset + c];
    }

    return true;
}

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

    // Grow matrix to add new row
    const newSize = (height + 1) * width;
    if (matrix.length < newSize) {
        const newMatrix = new Float64Array(newSize);
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

    mat[newRowOffset + this.rhsColumn] = -fractionalPart;

    for (let colIndex = 1; colIndex < this.varIndexByCol.length; colIndex += 1) {
        const variable = this.variablesPerIndex[this.varIndexByCol[colIndex]];
        const coefficient = mat[cutRowOffset + colIndex];
        const termCoeff = coefficient - Math.floor(coefficient);
        if (variable !== undefined && variable.isInteger) {
            mat[newRowOffset + colIndex] =
                termCoeff <= fractionalPart
                    ? -termCoeff
                    : (-(1 - termCoeff) * fractionalPart) / termCoeff;
        } else {
            mat[newRowOffset + colIndex] =
                coefficient >= 0
                    ? -coefficient
                    : (coefficient * fractionalPart) / (1 - fractionalPart);
        }
    }

    return true;
}

export function applyMIRCuts(this: Tableau): void {
    // Apply MIR (Mixed Integer Rounding) cuts to all rows with fractional integer variables
    // This tightens the LP relaxation and can help prune the branch-and-bound tree
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
