import type Tableau from "./tableau";
import type { VariableValue } from "./types";

export function getMostFractionalVar(this: Tableau): VariableValue {
    let biggestFraction = 0;
    let selectedVarIndex: number | null = null;
    let selectedVarValue = 0;

    const width = this.width;
    const matrix = this.matrix;
    const rhsColumn = this.rhsColumn;
    const integerVars = this.model.integerVariables;
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

export function getFractionalVarWithLowestCost(this: Tableau): VariableValue {
    let highestCost = Infinity;
    let selectedVarIndex: number | null = null;
    let selectedVarValue = null;

    const width = this.width;
    const matrix = this.matrix;
    const rhsColumn = this.rhsColumn;
    const integerVars = this.model.integerVariables;
    const nIntegerVars = integerVars.length;
    for (let v = 0; v < nIntegerVars; v += 1) {
        const variable = integerVars[v];
        const varIndex = variable.index;
        const varRow = this.rowByVarIndex[varIndex];
        if (varRow !== -1) {
            const varValue = matrix[varRow * width + rhsColumn];
            if (Math.abs(varValue - Math.round(varValue)) > this.precision && variable.cost < highestCost) {
                highestCost = variable.cost;
                selectedVarIndex = varIndex;
                selectedVarValue = varValue;
            }
        }
    }

    return { index: selectedVarIndex, value: selectedVarValue };
}
