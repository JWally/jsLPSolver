import Tableau from "./Tableau.js";

class VariableData {
    constructor(index, value) {
        this.index = index;
        this.value = value;
    }
}

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Tableau.prototype.getMostFractionalVar = function () {
    let biggestFraction = 0;
    let selectedVarIndex = null;
    let selectedVarValue = null;
    // var mid = 0.5;

    const integerVariables = this.model.integerVariables;
    // var nIntegerVars = integerVariables.length;
    for (let v = 0; v < integerVariables.length; v++) {
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

    return new VariableData(selectedVarIndex, selectedVarValue);
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Tableau.prototype.getFractionalVarWithLowestCost = function () {
    let highestCost = Infinity;
    let selectedVarIndex = null;
    let selectedVarValue = null;

    const integerVariables = this.model.integerVariables;
    // var nIntegerVars = integerVariables.length;
    for (let v = 0; v < integerVariables.length; v++) {
        const variable = integerVariables[v];
        const varIndex = variable.index;
        const varRow = this.rowByVarIndex[varIndex];
        if (varRow === -1) {
            // Variable value is non basic
            // its value is 0
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

    return new VariableData(selectedVarIndex, selectedVarValue);
};
