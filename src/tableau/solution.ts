import type Tableau from "./tableau";
import type { TableauSolutionSet } from "./types";

class Solution {
    feasible: boolean;
    evaluation: number;
    bounded: boolean;
    _tableau: Tableau;
    solutionSet: TableauSolutionSet;

    constructor(tableau: Tableau, evaluation: number, feasible: boolean, bounded: boolean) {
        this.feasible = feasible;
        this.evaluation = evaluation;
        this.bounded = bounded;
        this._tableau = tableau;
        this.solutionSet = {};
    }

    generateSolutionSet(): TableauSolutionSet {
        const solutionSet: TableauSolutionSet = {};

        const tableau = this._tableau;
        const varIndexByRow = tableau.varIndexByRow;
        const variablesPerIndex = tableau.variablesPerIndex;
        const matrix = tableau.matrix;
        const rhsColumn = tableau.rhsColumn;
        const lastRow = tableau.height - 1;
        const roundingCoeff = Math.round(1 / tableau.precision);

        for (let r = 1; r <= lastRow; r += 1) {
            const varIndex = varIndexByRow[r];
            const variable = variablesPerIndex[varIndex];
            if (variable === undefined || variable.isSlack === true) {
                continue;
            }

            const varValue = matrix[r][rhsColumn];
            solutionSet[variable.id] =
                Math.round((Number.EPSILON + varValue) * roundingCoeff) / roundingCoeff;
        }

        return solutionSet;
    }
}

export default Solution;
