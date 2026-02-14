/**
 * @file src/tableau/dynamic-modification.ts
 * @description Runtime tableau modification operations
 *
 * Supports modifying the LP after initial solve:
 * - Add/remove constraints
 * - Add/remove variables
 * - Update constraint coefficients and RHS values
 * - Update objective function costs
 *
 * Functions are designed to be bound to a Tableau instance via `this`.
 */
import type Tableau from "./tableau";
import type { Constraint, Variable } from "../expressions";

/**
 * Ensure a variable is in the basis (basic). If non-basic, pivot it in.
 *
 * @param varIndex - Internal index of the variable to make basic.
 * @returns Row index where the variable is now basic.
 */
export function putInBase(this: Tableau, varIndex: number): number {
    const width = this.width;
    let r = this.rowByVarIndex[varIndex];
    if (r === -1) {
        const c = this.colByVarIndex[varIndex];

        for (let r1 = 1; r1 < this.height; r1 += 1) {
            const coefficient = this.matrix[r1 * width + c];
            if (coefficient < -this.precision || this.precision < coefficient) {
                r = r1;
                break;
            }
        }

        this.pivot(r, c);
    }

    return r;
}

/**
 * Ensure a variable is non-basic. If currently basic, pivot it out.
 *
 * @param varIndex - Internal index of the variable to make non-basic.
 * @returns Column index where the variable is now non-basic.
 */
export function takeOutOfBase(this: Tableau, varIndex: number): number {
    const width = this.width;
    let c = this.colByVarIndex[varIndex];
    if (c === -1) {
        const r = this.rowByVarIndex[varIndex];
        const pivotRowOffset = r * width;

        for (let c1 = 1; c1 < this.height; c1 += 1) {
            const coefficient = this.matrix[pivotRowOffset + c1];
            if (coefficient < -this.precision || this.precision < coefficient) {
                c = c1;
                break;
            }
        }

        this.pivot(r, c);
    }

    return c;
}

/**
 * Read current variable values from the tableau matrix into Variable.value.
 * Non-basic variables get value 0; basic variables get their RHS value (rounded).
 */
export function updateVariableValues(this: Tableau): void {
    const width = this.width;
    const matrix = this.matrix;
    const rhsColumn = this.rhsColumn;
    const nVars = this.variables.length;
    const roundingCoeff = Math.round(1 / this.precision);
    for (let v = 0; v < nVars; v += 1) {
        const variable = this.variables[v];
        const varIndex = variable.index;

        const r = this.rowByVarIndex[varIndex];
        if (r === -1) {
            variable.value = 0;
        } else {
            const varValue = matrix[r * width + rhsColumn];
            variable.value =
                Math.round((varValue + Number.EPSILON) * roundingCoeff) / roundingCoeff;
        }
    }
}

/**
 * Update a constraint's RHS value in the current tableau.
 *
 * If the constraint's slack is basic, directly adjusts the RHS cell.
 * If non-basic, propagates the change through all rows using the slack column.
 *
 * @param constraint - The constraint to update.
 * @param difference - Amount to subtract from the current RHS.
 */
export function updateRightHandSide(
    this: Tableau,
    constraint: Constraint,
    difference: number
): void {
    const width = this.width;
    const matrix = this.matrix;
    const rhsColumn = this.rhsColumn;
    const lastRow = this.height - 1;
    const constraintRow = this.rowByVarIndex[constraint.index];
    if (constraintRow === -1) {
        const slackColumn = this.colByVarIndex[constraint.index];

        for (let r = 0; r <= lastRow; r += 1) {
            const rowOffset = r * width;
            matrix[rowOffset + rhsColumn] -= difference * matrix[rowOffset + slackColumn];
        }

        const nOptionalObjectives = this.optionalObjectives.length;
        if (nOptionalObjectives > 0) {
            for (let o = 0; o < nOptionalObjectives; o += 1) {
                const reducedCosts = this.optionalObjectives[o].reducedCosts;
                reducedCosts[rhsColumn] -= difference * reducedCosts[slackColumn];
            }
        }
    } else {
        matrix[constraintRow * width + rhsColumn] -= difference;
    }
}

/**
 * Update a variable's coefficient in a constraint within the active tableau.
 *
 * Ensures the constraint is basic (via putInBase) then applies the coefficient
 * change. Handles both basic and non-basic target variables.
 *
 * @param constraint - The constraint being modified.
 * @param variable - The variable whose coefficient is changing.
 * @param difference - Amount to add to the current coefficient.
 * @throws If constraint.index equals variable.index.
 */
export function updateConstraintCoefficient(
    this: Tableau,
    constraint: Constraint,
    variable: Variable,
    difference: number
): void {
    if (constraint.index === variable.index) {
        throw new Error(
            "[Tableau.updateConstraintCoefficient] constraint index should not be equal to variable index !"
        );
    }

    const width = this.width;
    const matrix = this.matrix;
    const r = this.putInBase(constraint.index);
    const rowOffset = r * width;

    const colVar = this.colByVarIndex[variable.index];
    if (colVar === -1) {
        const rowVar = this.rowByVarIndex[variable.index];
        const rowVarOffset = rowVar * width;
        for (let c = 0; c < width; c += 1) {
            matrix[rowOffset + c] += difference * matrix[rowVarOffset + c];
        }
    } else {
        matrix[rowOffset + colVar] -= difference;
    }
}

/**
 * Update a variable's objective coefficient in the active tableau.
 *
 * If the variable is basic, propagates the cost change through the cost row
 * (or optional objective's reduced costs). If non-basic, directly updates its column.
 *
 * @param variable - The variable whose cost is changing.
 * @param difference - Amount to add to the current reduced cost.
 */
export function updateCost(this: Tableau, variable: Variable, difference: number): void {
    const width = this.width;
    const matrix = this.matrix;
    const varIndex = variable.index;
    const lastColumn = width - 1;
    const varColumn = this.colByVarIndex[varIndex];
    if (varColumn === -1) {
        const variableRowOffset = this.rowByVarIndex[varIndex] * width;

        if (variable.priority === 0) {
            // Cost row is row 0
            for (let c = 0; c <= lastColumn; c += 1) {
                matrix[c] += difference * matrix[variableRowOffset + c];
            }
        } else {
            const reducedCosts = this.objectivesByPriority[variable.priority].reducedCosts;
            for (let c = 0; c <= lastColumn; c += 1) {
                reducedCosts[c] += difference * matrix[variableRowOffset + c];
            }
        }
    } else {
        matrix[varColumn] -= difference; // row 0, col varColumn
    }
}

/**
 * Add a new constraint row to the active tableau.
 *
 * Appends a new row with the constraint's terms expressed in the current basis.
 * Grows the matrix capacity with exponential growth strategy if needed.
 * The constraint's slack variable becomes the basic variable in the new row.
 *
 * @param constraint - The constraint to add (with terms already populated).
 */
export function addConstraint(this: Tableau, constraint: Constraint): void {
    const sign = constraint.isUpperBound ? 1 : -1;
    const lastRow = this.height;
    const width = this.width;
    const lastColumn = width - 1;

    // Check if we need to grow the matrix capacity (using exponential growth)
    const newRowCount = lastRow + 1;
    const requiredSize = newRowCount * width;
    if (this.matrix.length < requiredSize) {
        // Use exponential growth strategy (1.5x) with minimum increment
        const currentCapacity = this.matrix.length;
        const minGrowth = Math.max(width * 16, Math.floor(currentCapacity * 0.5));
        const newCapacity = currentCapacity + minGrowth;

        const oldMatrix = this.matrix;
        const newMatrix = new Float64Array(newCapacity);
        newMatrix.set(oldMatrix);
        this.matrix = newMatrix;
    }

    const matrix = this.matrix;
    const constraintRowOffset = lastRow * width;

    // Zero out the new row
    for (let c = 0; c <= lastColumn; c += 1) {
        matrix[constraintRowOffset + c] = 0;
    }

    matrix[constraintRowOffset + this.rhsColumn] = sign * constraint.rhs;

    const terms = constraint.terms;
    const nTerms = terms.length;
    for (let t = 0; t < nTerms; t += 1) {
        const term = terms[t];
        const coefficient = term.coefficient;
        const varIndex = term.variable.index;

        const varRowIndex = this.rowByVarIndex[varIndex];
        if (varRowIndex === -1) {
            matrix[constraintRowOffset + this.colByVarIndex[varIndex]] += sign * coefficient;
        } else {
            const varRowOffset = varRowIndex * width;
            for (let c = 0; c <= lastColumn; c += 1) {
                matrix[constraintRowOffset + c] -= sign * coefficient * matrix[varRowOffset + c];
            }
        }
    }

    const slackIndex = constraint.index;
    this.varIndexByRow[lastRow] = slackIndex;
    this.rowByVarIndex[slackIndex] = lastRow;
    this.colByVarIndex[slackIndex] = -1;

    this.height += 1;
}

/**
 * Remove a constraint from the active tableau.
 *
 * Pivots the constraint's slack into the basis, swaps the row with the last row,
 * and decrements the height. The slack variable's index is returned to the pool.
 *
 * @param constraint - The constraint to remove.
 */
export function removeConstraint(this: Tableau, constraint: Constraint): void {
    const slackIndex = constraint.index;
    const lastRow = this.height - 1;
    const width = this.width;
    const matrix = this.matrix;

    const r = this.putInBase(slackIndex);

    // Swap row r with lastRow
    const rowOffset = r * width;
    const lastRowOffset = lastRow * width;
    for (let c = 0; c < width; c++) {
        const tmp = matrix[lastRowOffset + c];
        matrix[lastRowOffset + c] = matrix[rowOffset + c];
        matrix[rowOffset + c] = tmp;
    }

    this.varIndexByRow[r] = this.varIndexByRow[lastRow];
    this.varIndexByRow[lastRow] = -1;
    this.rowByVarIndex[slackIndex] = -1;

    this.availableIndexes[this.availableIndexes.length] = slackIndex;

    constraint.slack.index = -1;

    this.height -= 1;
}

/**
 * Add a new variable (column) to the active tableau.
 *
 * Requires reallocating the matrix since the stride (width) changes.
 * Sets the variable's reduced cost in the appropriate objective row.
 *
 * @param variable - The variable to add (cost and priority must be set).
 */
export function addVariable(this: Tableau, variable: Variable): void {
    const _lastRow = this.height - 1;
    const oldWidth = this.width;
    const newWidth = oldWidth + 1;
    const height = this.height;
    const cost = this.model.isMinimization === true ? -variable.cost : variable.cost;
    const priority = variable.priority;

    // Need to expand the matrix to add a new column
    // This requires reallocating and copying with new layout
    // Note: Column capacity optimization would require changing all matrix access
    // to use capacity as stride, which is too invasive. Keep simple reallocation.
    const oldMatrix = this.matrix;
    const newMatrix = new Float64Array(height * newWidth);

    // Copy old data with new width
    for (let r = 0; r < height; r++) {
        const oldOffset = r * oldWidth;
        const newOffset = r * newWidth;
        for (let c = 0; c < oldWidth; c++) {
            newMatrix[newOffset + c] = oldMatrix[oldOffset + c];
        }
        // New column is 0 by default
    }

    this.matrix = newMatrix;
    this.width = newWidth;

    const lastColumn = newWidth - 1;

    const nOptionalObjectives = this.optionalObjectives.length;
    if (nOptionalObjectives > 0) {
        for (let o = 0; o < nOptionalObjectives; o += 1) {
            this.optionalObjectives[o].reducedCosts[lastColumn] = 0;
        }
    }

    if (priority === 0) {
        newMatrix[lastColumn] = cost; // row 0, col lastColumn
    } else {
        this.setOptionalObjective(priority, lastColumn, cost);
        newMatrix[lastColumn] = 0;
    }

    this.colByVarIndex[variable.index] = lastColumn;
    this.varIndexByCol[lastColumn] = variable.index;
}

/**
 * Remove a variable (column) from the active tableau.
 *
 * Pivots the variable out of the basis if basic, then overwrites its column
 * with the last column and decrements width. The variable index is recycled.
 *
 * @param variable - The variable to remove.
 */
export function removeVariable(this: Tableau, variable: Variable): void {
    const varIndex = variable.index;
    const width = this.width;
    const matrix = this.matrix;
    const lastColumn = width - 1;

    const c = this.takeOutOfBase(varIndex);

    const lastRow = this.height - 1;
    for (let r = 0; r <= lastRow; r += 1) {
        const rowOffset = r * width;
        matrix[rowOffset + c] = matrix[rowOffset + lastColumn];
    }

    this.varIndexByCol[c] = this.varIndexByCol[lastColumn];
    this.rowByVarIndex[varIndex] = -1;
    this.colByVarIndex[varIndex] = -1;

    this.availableIndexes[this.availableIndexes.length] = varIndex;

    this.width -= 1;
}
