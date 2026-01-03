import type Tableau from "./tableau";

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

export function isIntegral(this: Tableau): boolean {
    const width = this.width;
    const matrix = this.matrix;
    const rhsColumn = this.rhsColumn;
    const integerVariables = this.model.integerVariables;
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
            if (Math.min(distance - Math.floor(distance), Math.floor(distance + 1)) < this.precision) {
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
