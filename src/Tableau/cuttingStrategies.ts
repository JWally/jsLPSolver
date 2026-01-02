import Tableau from "./Tableau";
import { SlackVariable } from "../expressions";
import type { BranchCut } from "./types";

Tableau.prototype.addCutConstraints = function addCutConstraints(
    this: Tableau,
    cutConstraints: BranchCut[]
): void {
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
    for (let i = 0; i < nCutConstraints; i += 1) {
        const cut = cutConstraints[i];

        const r = height + i;

        const sign = cut.type === "min" ? -1 : 1;

        const varIndex = cut.varIndex;
        const varRowIndex = this.rowByVarIndex[varIndex];
        const constraintRow = this.matrix[r];
        if (varRowIndex === -1) {
            constraintRow[this.rhsColumn] = sign * cut.value;
            for (let c = 1; c <= lastColumn; c += 1) {
                constraintRow[c] = 0;
            }
            constraintRow[this.colByVarIndex[varIndex]] = sign;
        } else {
            const varRow = this.matrix[varRowIndex];
            const varValue = varRow[this.rhsColumn];
            constraintRow[this.rhsColumn] = sign * (cut.value - varValue);
            for (let c = 1; c <= lastColumn; c += 1) {
                constraintRow[c] = -sign * varRow[c];
            }
        }

        const slackVarIndex = this.getNewElementIndex();
        this.varIndexByRow[r] = slackVarIndex;
        this.rowByVarIndex[slackVarIndex] = r;
        this.colByVarIndex[slackVarIndex] = -1;
        this.variablesPerIndex[slackVarIndex] = new SlackVariable("s" + slackVarIndex, slackVarIndex);
        this.nVars += 1;
    }
};

Tableau.prototype._addLowerBoundMIRCut = function _addLowerBoundMIRCut(this: Tableau, rowIndex: number): boolean {
    if (rowIndex === this.costRowIndex) {
        return false;
    }

    const matrix = this.matrix;

    const intVar = this.variablesPerIndex[this.varIndexByRow[rowIndex]];
    if (!intVar?.isInteger) {
        return false;
    }

    const d = matrix[rowIndex][this.rhsColumn];
    const frac_d = d - Math.floor(d);

    if (frac_d < this.precision || 1 - this.precision < frac_d) {
        return false;
    }

    const r = this.height;
    matrix[r] = matrix[r - 1].slice();
    this.height += 1;

    this.nVars += 1;
    const slackVarIndex = this.getNewElementIndex();
    this.varIndexByRow[r] = slackVarIndex;
    this.rowByVarIndex[slackVarIndex] = r;
    this.colByVarIndex[slackVarIndex] = -1;
    this.variablesPerIndex[slackVarIndex] = new SlackVariable("s" + slackVarIndex, slackVarIndex);

    matrix[r][this.rhsColumn] = Math.floor(d);

    for (let colIndex = 1; colIndex < this.varIndexByCol.length; colIndex += 1) {
        const variable = this.variablesPerIndex[this.varIndexByCol[colIndex]];

        if (!variable?.isInteger) {
            matrix[r][colIndex] = Math.min(0, matrix[rowIndex][colIndex] / (1 - frac_d));
        } else {
            const coef = matrix[rowIndex][colIndex];
            const termCoeff = Math.floor(coef) + Math.max(0, coef - Math.floor(coef) - frac_d) / (1 - frac_d);
            matrix[r][colIndex] = termCoeff;
        }
    }

    for (let c = 0; c < this.width; c += 1) {
        matrix[r][c] -= matrix[rowIndex][c];
    }

    return true;
};

Tableau.prototype._addUpperBoundMIRCut = function _addUpperBoundMIRCut(this: Tableau, rowIndex: number): boolean {
    if (rowIndex === this.costRowIndex) {
        return false;
    }

    const matrix = this.matrix;

    const intVar = this.variablesPerIndex[this.varIndexByRow[rowIndex]];
    if (!intVar?.isInteger) {
        return false;
    }

    const b = matrix[rowIndex][this.rhsColumn];
    const f = b - Math.floor(b);

    if (f < this.precision || 1 - this.precision < f) {
        return false;
    }

    const r = this.height;
    matrix[r] = matrix[r - 1].slice();
    this.height += 1;

    this.nVars += 1;
    const slackVarIndex = this.getNewElementIndex();
    this.varIndexByRow[r] = slackVarIndex;
    this.rowByVarIndex[slackVarIndex] = r;
    this.colByVarIndex[slackVarIndex] = -1;
    this.variablesPerIndex[slackVarIndex] = new SlackVariable("s" + slackVarIndex, slackVarIndex);

    matrix[r][this.rhsColumn] = -f;

    for (let colIndex = 1; colIndex < this.varIndexByCol.length; colIndex += 1) {
        const variable = this.variablesPerIndex[this.varIndexByCol[colIndex]];

        const aj = matrix[rowIndex][colIndex];
        const fj = aj - Math.floor(aj);

        if (variable?.isInteger) {
            if (fj <= f) {
                matrix[r][colIndex] = -fj;
            } else {
                matrix[r][colIndex] = -(1 - fj) * f / fj;
            }
        } else if (aj >= 0) {
            matrix[r][colIndex] = -aj;
        } else {
            matrix[r][colIndex] = (aj * f) / (1 - f);
        }
    }

    return true;
};

Tableau.prototype.applyMIRCuts = function applyMIRCuts(this: Tableau): void {
    // intentionally left blank (see historical note in JS version)
};
