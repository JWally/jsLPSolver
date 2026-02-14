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
 *
 * Contains the feasibility status, objective value, and provides a method
 * to extract variable values from the tableau's current state.
 */
export class Solution {
    /** Whether the solver found a feasible solution. */
    feasible: boolean;
    /** Optimal objective function value (in the model's original direction). */
    evaluation: number;
    /** Whether the problem is bounded (false = unbounded objective). */
    bounded: boolean;
    /** Reference to the source tableau (used by generateSolutionSet). */
    _tableau: Tableau;
    /** Cached variable-to-value mapping (populated by generateSolutionSet). */
    solutionSet: TableauSolutionSet;

    /**
     * @param tableau - The solved tableau containing variable values.
     * @param evaluation - Objective value (already sign-corrected for min/max).
     * @param feasible - Whether a feasible solution exists.
     * @param bounded - Whether the objective is bounded.
     */
    constructor(tableau: Tableau, evaluation: number, feasible: boolean, bounded: boolean) {
        this.feasible = feasible;
        this.evaluation = evaluation;
        this.bounded = bounded;
        this._tableau = tableau;
        this.solutionSet = {};
    }

    /**
     * Extract variable values from the tableau's current state.
     *
     * Iterates over all basic variables, skipping slack variables, and
     * rounds values to the tableau's precision to avoid floating-point noise.
     *
     * @returns A map from variable ID to its solution value.
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
 *
 * Extends the base Solution with the number of branch-and-cut iterations
 * performed, which is useful for performance analysis and debugging.
 */
export class MilpSolution extends Solution {
    /** Number of branch-and-cut iterations (nodes explored) to find this solution. */
    iter: number;

    /**
     * @param tableau - The solved tableau.
     * @param evaluation - Objective value.
     * @param feasible - Whether an integer-feasible solution was found.
     * @param bounded - Whether the problem is bounded.
     * @param branchAndCutIterations - Number of B&C nodes explored.
     */
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
