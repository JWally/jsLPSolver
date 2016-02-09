/*global module*/

function Solution(tableau, evaluation, feasible) {
    this.feasible = feasible;
    this.evaluation = evaluation;
    this._tableau = tableau;
}
module.exports = Solution;

Solution.prototype.generateSolutionSet = function () {
    var solutionSet = {};

    var tableau = this._tableau;
    var basicIndexes = tableau.basicIndexes;
    var variableIds = tableau.variableIds;
    var matrix = tableau.matrix;
    var rhsColumn = tableau.rhsColumn;
    var lastRow = tableau.height - 1;
    var roundingCoeff = Math.round(1 / tableau.precision);

    for (var r = 1; r <= lastRow; r += 1) {
        var varIndex = basicIndexes[r];
        var variableId = variableIds[varIndex];
        if (variableId !== undefined) {
            var varValue = matrix[r][rhsColumn];
            solutionSet[variableId] =
                Math.round(varValue * roundingCoeff) / roundingCoeff;
        }
    }

    return solutionSet;
};