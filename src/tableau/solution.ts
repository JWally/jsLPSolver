/**
 * @file src/tableau/solution.ts
 * @description Solution classes for LP and MIP results
 *
 * Provides solution containers for optimization results:
 * - Solution: Base class for continuous LP problems
 * - MilpSolution: Extended class for mixed-integer problems
 *
 * Solutions include feasibility status, objective value, and variable values.
 */
import type Tableau from "./tableau";
import type { TableauSolutionSet } from "./types";

/**
 * Represents a solution to a linear programming problem.
 */
export class Solution {
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

    /**
     * Generate the solution set mapping variable IDs to their values.
     */
    generateSolutionSet(): TableauSolutionSet {
        const solutionSet: TableauSolutionSet = {};

        const tableau = this._tableau;
        const varIndexByRow = tableau.varIndexByRow;
        const variablesPerIndex = tableau.variablesPerIndex;
        const matrix = tableau.matrix;
        const width = tableau.width;
        const rhsColumn = tableau.rhsColumn;
        const lastRow = tableau.height - 1;
        const roundingCoeff = Math.round(1 / tableau.precision);

        for (let r = 1; r <= lastRow; r += 1) {
            const varIndex = varIndexByRow[r];
            const variable = variablesPerIndex[varIndex];
            if (variable === undefined || variable.isSlack === true) {
                continue;
            }

            const varValue = matrix[r * width + rhsColumn];
            solutionSet[variable.id] =
                Math.round((Number.EPSILON + varValue) * roundingCoeff) / roundingCoeff;
        }

        return solutionSet;
    }
}

/**
 * Represents a solution to a mixed-integer programming problem.
 * Extends Solution with branch-and-cut iteration tracking.
 */
export class MilpSolution extends Solution {
    iter: number;

    constructor(
        tableau: Tableau,
        evaluation: number,
        feasible: boolean,
        bounded: boolean,
        branchAndCutIterations: number
    ) {
        super(tableau, evaluation, feasible, bounded);
        this.iter = branchAndCutIterations;
    }
}

// Default export for backwards compatibility
export default Solution;
