import Tableau from "./Tableau";

Tableau.prototype.countIntegerValues = function countIntegerValues(this: Tableau): number {
    let count = 0;
    for (let r = 1; r < this.height; r += 1) {
        if (this.variablesPerIndex[this.varIndexByRow[r]]?.isInteger) {
            let decimalPart = this.matrix[r][this.rhsColumn];
            decimalPart = decimalPart - Math.floor(decimalPart);
            if (decimalPart < this.precision && -decimalPart < this.precision) {
                count += 1;
            }
        }
    }

    return count;
};

Tableau.prototype.isIntegral = function isIntegral(this: Tableau): boolean {
    const integerVariables = this.model.integerVariables;
    const nIntegerVars = integerVariables.length;
    for (let v = 0; v < nIntegerVars; v++) {
        const varRow = this.rowByVarIndex[integerVariables[v].index];
        if (varRow === -1) {
            continue;
        }

        const varValue = this.matrix[varRow][this.rhsColumn];
        if (Math.abs(varValue - Math.round(varValue)) > this.precision) {
            return false;
        }
    }
    return true;
};

Tableau.prototype.computeFractionalVolume = function computeFractionalVolume(
    this: Tableau,
    ignoreIntegerValues?: boolean
): number {
    let volume = -1;

    for (let r = 1; r < this.height; r += 1) {
        if (this.variablesPerIndex[this.varIndexByRow[r]]?.isInteger) {
            let rhs = this.matrix[r][this.rhsColumn];
            rhs = Math.abs(rhs);
            const decimalPart = Math.min(rhs - Math.floor(rhs), Math.floor(rhs + 1));
            if (decimalPart < this.precision) {
                if (!ignoreIntegerValues) {
                    return 0;
                }
            } else if (volume === -1) {
                volume = rhs;
            } else {
                volume *= rhs;
            }
        }
    }

    if (volume === -1) {
        return 0;
    }
    return volume;
};
