import { SlackVariable } from "../Expressions.js";

export default class Solution {
    constructor(tableau, evaluation, feasible, bounded) {
        this.feasible = feasible;
        this.evaluation = evaluation;
        this.bounded = bounded;
        this._tableau = tableau;
    }

    generateSolutionSet() {
        var solutionSet = {};

        var tableau = this._tableau;
        var varIndexByRow = tableau.varIndexByRow;
        var variablesPerIndex = tableau.variablesPerIndex;
        var matrix = tableau.matrix;
        var rhsColumn = tableau.rhsColumn;
        var lastRow = tableau.height - 1;
        var roundingCoeff = Math.round(1 / tableau.precision);

        for (let r = 1; r <= lastRow; r += 1) {
            const varIndex = varIndexByRow[r];
            const variable = variablesPerIndex[varIndex];
            // if (variable === undefined || variable.isSlack === true) {
            if (variable === undefined || variable instanceof SlackVariable) {
                continue;
            }

            const varValue = matrix[r][rhsColumn];
            solutionSet[variable.id] =
                Math.round((Number.EPSILON + varValue) * roundingCoeff) / roundingCoeff;
        }

        return solutionSet;
    }
}
