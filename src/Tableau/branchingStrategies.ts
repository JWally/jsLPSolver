import Tableau from "./Tableau";
import type { VariableValue } from "./types";

Tableau.prototype.getMostFractionalVar = function getMostFractionalVar(this: Tableau): VariableValue {
    let biggestFraction = 0;
    let selectedVarIndex: number | null = null;
    let selectedVarValue: number | null = null;

    const integerVariables = this.model.integerVariables;
    const nIntegerVars = integerVariables.length;
    for (let v = 0; v < nIntegerVars; v++) {
        const varIndex = integerVariables[v].index;
        const varRow = this.rowByVarIndex[varIndex];
        if (varRow === -1) {
            continue;
        }

        const varValue = this.matrix[varRow][this.rhsColumn];
        const fraction = Math.abs(varValue - Math.round(varValue));
        if (biggestFraction < fraction) {
            biggestFraction = fraction;
            selectedVarIndex = varIndex;
            selectedVarValue = varValue;
        }
    }

    return { index: selectedVarIndex, value: selectedVarValue };
};

Tableau.prototype.getFractionalVarWithLowestCost =
function getFractionalVarWithLowestCost(this: Tableau): VariableValue {
    let highestCost = Infinity;
    let selectedVarIndex: number | null = null;
    let selectedVarValue: number | null = null;

    const integerVariables = this.model.integerVariables;
    const nIntegerVars = integerVariables.length;
    for (let v = 0; v < nIntegerVars; v++) {
        const variable = integerVariables[v];
        const varIndex = variable.index;
        const varRow = this.rowByVarIndex[varIndex];
        if (varRow === -1) {
            continue;
        }

        const varValue = this.matrix[varRow][this.rhsColumn];
        if (Math.abs(varValue - Math.round(varValue)) > this.precision) {
            const cost = variable.cost;
            if (highestCost > cost) {
                highestCost = cost;
                selectedVarIndex = varIndex;
                selectedVarValue = varValue;
            }
        }
    }

    return { index: selectedVarIndex, value: selectedVarValue };
};
