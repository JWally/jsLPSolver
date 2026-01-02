import type Tableau from "./tableau";
import { SlackVariable } from "../expressions";
import type { BranchCut } from "./types";

export function addCutConstraints(this: Tableau, cutConstraints: BranchCut[]): void {
    const nCutConstraints = cutConstraints.length;
    const height = this.height;
    const heightWithCuts = height + nCutConstraints;
    for (let h = height; h < heightWithCuts; h += 1) {
        if (this.matrix[h] === undefined) {
            this.matrix[h] = this.matrix[h - 1].slice();
        }
    }

    this.height = heightWithCuts;
    this.nVars = this.width + this.height - 2;
    const lastColumn = this.width - 1;
    for (let h = 0; h < nCutConstraints; h += 1) {
        const cut = cutConstraints[h];
        const cutRow = height + h;
        const sign = cut.type === "min" ? -1 : 1;

        const varIndex = cut.varIndex;
        let varRowIndex = this.rowByVarIndex[varIndex];
        const cutRowVector = this.matrix[cutRow];

        if (varRowIndex === -1) {
            cutRowVector[this.rhsColumn] = sign * cut.value;

            for (let c = 1; c <= lastColumn; c += 1) {
                cutRowVector[c] = 0;
            }

            cutRowVector[this.colByVarIndex[varIndex]] = sign;
        } else {
            const varRow = this.matrix[varRowIndex];
            const varValue = varRow[this.rhsColumn];

            cutRowVector[this.rhsColumn] = sign * (cut.value - varValue);

            for (let c = 1; c <= lastColumn; c += 1) {
                cutRowVector[c] = -sign * varRow[c];
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

    const cutRow = this.matrix[rowIndex];
    const integerVar = this.variablesPerIndex[this.varIndexByRow[rowIndex]];
    if (integerVar === undefined || !integerVar.isInteger) {
        return false;
    }

    const fractionalPart = cutRow[this.rhsColumn] - Math.floor(cutRow[this.rhsColumn]);
    if (fractionalPart < this.precision || fractionalPart > 1 - this.precision) {
        return false;
    }

    const height = this.height;
    const newRow = this.matrix[height] = this.matrix[height - 1].slice();
    this.height += 1;
    this.nVars += 1;

    const slackVarIndex = this.getNewElementIndex();
    this.varIndexByRow[height] = slackVarIndex;
    this.rowByVarIndex[slackVarIndex] = height;
    this.colByVarIndex[slackVarIndex] = -1;
    this.variablesPerIndex[slackVarIndex] = new SlackVariable("s" + slackVarIndex, slackVarIndex);

    newRow[this.rhsColumn] = Math.floor(cutRow[this.rhsColumn]);

    for (let colIndex = 1; colIndex < this.varIndexByCol.length; colIndex += 1) {
        const variable = this.variablesPerIndex[this.varIndexByCol[colIndex]];
        if (variable !== undefined && variable.isInteger) {
            const coefficient = cutRow[colIndex];
            const termCoeff = Math.floor(coefficient) + Math.max(0, coefficient - Math.floor(coefficient) - fractionalPart) / (1 - fractionalPart);
            newRow[colIndex] = termCoeff;
        } else {
            newRow[colIndex] = Math.min(0, cutRow[colIndex] / (1 - fractionalPart));
        }
    }

    for (let c = 0; c < this.width; c += 1) {
        newRow[c] -= cutRow[c];
    }

    return true;
}

export function addUpperBoundMIRCut(this: Tableau, rowIndex: number): boolean {
    if (rowIndex === this.costRowIndex) {
        return false;
    }

    const cutRow = this.matrix[rowIndex];
    const integerVar = this.variablesPerIndex[this.varIndexByRow[rowIndex]];
    if (integerVar === undefined || !integerVar.isInteger) {
        return false;
    }

    const fractionalPart = cutRow[this.rhsColumn] - Math.floor(cutRow[this.rhsColumn]);
    if (fractionalPart < this.precision || fractionalPart > 1 - this.precision) {
        return false;
    }

    const height = this.height;
    const newRow = this.matrix[height] = this.matrix[height - 1].slice();
    this.height += 1;
    this.nVars += 1;

    const slackVarIndex = this.getNewElementIndex();
    this.varIndexByRow[height] = slackVarIndex;
    this.rowByVarIndex[slackVarIndex] = height;
    this.colByVarIndex[slackVarIndex] = -1;
    this.variablesPerIndex[slackVarIndex] = new SlackVariable("s" + slackVarIndex, slackVarIndex);

    newRow[this.rhsColumn] = -fractionalPart;

    for (let colIndex = 1; colIndex < this.varIndexByCol.length; colIndex += 1) {
        const variable = this.variablesPerIndex[this.varIndexByCol[colIndex]];
        const coefficient = cutRow[colIndex];
        const termCoeff = coefficient - Math.floor(coefficient);
        if (variable !== undefined && variable.isInteger) {
            newRow[colIndex] = termCoeff <= fractionalPart ? -termCoeff : -(1 - termCoeff) * fractionalPart / termCoeff;
        } else {
            newRow[colIndex] = coefficient >= 0 ? -coefficient : coefficient * fractionalPart / (1 - fractionalPart);
        }
    }

    return true;
}

export function applyMIRCuts(this: Tableau): void {
    // Nothing in the original implementation.
}
