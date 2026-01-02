import type Tableau from "./tableau";
import type { Constraint, Variable } from "../expressions";

export function putInBase(this: Tableau, varIndex: number): number {
    let r = this.rowByVarIndex[varIndex];
    if (r === -1) {
        const c = this.colByVarIndex[varIndex];

        for (let r1 = 1; r1 < this.height; r1 += 1) {
            const coefficient = this.matrix[r1][c];
            if (coefficient < -this.precision || this.precision < coefficient) {
                r = r1;
                break;
            }
        }

        this.pivot(r, c);
    }

    return r;
}

export function takeOutOfBase(this: Tableau, varIndex: number): number {
    let c = this.colByVarIndex[varIndex];
    if (c === -1) {
        const r = this.rowByVarIndex[varIndex];

        const pivotRow = this.matrix[r];
        for (let c1 = 1; c1 < this.height; c1 += 1) {
            const coefficient = pivotRow[c1];
            if (coefficient < -this.precision || this.precision < coefficient) {
                c = c1;
                break;
            }
        }

        this.pivot(r, c);
    }

    return c;
}

export function updateVariableValues(this: Tableau): void {
    const nVars = this.variables.length;
    const roundingCoeff = Math.round(1 / this.precision);
    for (let v = 0; v < nVars; v += 1) {
        const variable = this.variables[v];
        const varIndex = variable.index;

        const r = this.rowByVarIndex[varIndex];
        if (r === -1) {
            variable.value = 0;
        } else {
            const varValue = this.matrix[r][this.rhsColumn];
            variable.value = Math.round((varValue + Number.EPSILON) * roundingCoeff) / roundingCoeff;
        }
    }
}

export function updateRightHandSide(
    this: Tableau,
    constraint: Constraint,
    difference: number
): void {
    const lastRow = this.height - 1;
    const constraintRow = this.rowByVarIndex[constraint.index];
    if (constraintRow === -1) {
        const slackColumn = this.colByVarIndex[constraint.index];

        for (let r = 0; r <= lastRow; r += 1) {
            const row = this.matrix[r];
            row[this.rhsColumn] -= difference * row[slackColumn];
        }

        const nOptionalObjectives = this.optionalObjectives.length;
        if (nOptionalObjectives > 0) {
            for (let o = 0; o < nOptionalObjectives; o += 1) {
                const reducedCosts = this.optionalObjectives[o].reducedCosts;
                reducedCosts[this.rhsColumn] -= difference * reducedCosts[slackColumn];
            }
        }
    } else {
        this.matrix[constraintRow][this.rhsColumn] -= difference;
    }
}

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

    const r = this.putInBase(constraint.index);

    const colVar = this.colByVarIndex[variable.index];
    if (colVar === -1) {
        const rowVar = this.rowByVarIndex[variable.index];
        for (let c = 0; c < this.width; c += 1) {
            this.matrix[r][c] += difference * this.matrix[rowVar][c];
        }
    } else {
        this.matrix[r][colVar] -= difference;
    }
}

export function updateCost(this: Tableau, variable: Variable, difference: number): void {
    const varIndex = variable.index;
    const lastColumn = this.width - 1;
    const varColumn = this.colByVarIndex[varIndex];
    if (varColumn === -1) {
        const variableRow = this.matrix[this.rowByVarIndex[varIndex]];

        if (variable.priority === 0) {
            const costRow = this.matrix[0];

            for (let c = 0; c <= lastColumn; c += 1) {
                costRow[c] += difference * variableRow[c];
            }
        } else {
            const reducedCosts = this.objectivesByPriority[variable.priority].reducedCosts;
            for (let c = 0; c <= lastColumn; c += 1) {
                reducedCosts[c] += difference * variableRow[c];
            }
        }
    } else {
        this.matrix[0][varColumn] -= difference;
    }
}

export function addConstraint(this: Tableau, constraint: Constraint): void {
    const sign = constraint.isUpperBound ? 1 : -1;
    const lastRow = this.height;

    let constraintRow = this.matrix[lastRow];
    if (constraintRow === undefined) {
        constraintRow = this.matrix[0].slice();
        this.matrix[lastRow] = constraintRow;
    }

    const lastColumn = this.width - 1;
    for (let c = 0; c <= lastColumn; c += 1) {
        constraintRow[c] = 0;
    }

    constraintRow[this.rhsColumn] = sign * constraint.rhs;

    const terms = constraint.terms;
    const nTerms = terms.length;
    for (let t = 0; t < nTerms; t += 1) {
        const term = terms[t];
        const coefficient = term.coefficient;
        const varIndex = term.variable.index;

        const varRowIndex = this.rowByVarIndex[varIndex];
        if (varRowIndex === -1) {
            constraintRow[this.colByVarIndex[varIndex]] += sign * coefficient;
        } else {
            const varRow = this.matrix[varRowIndex];
            for (let c = 0; c <= lastColumn; c += 1) {
                constraintRow[c] -= sign * coefficient * varRow[c];
            }
        }
    }

    const slackIndex = constraint.index;
    this.varIndexByRow[lastRow] = slackIndex;
    this.rowByVarIndex[slackIndex] = lastRow;
    this.colByVarIndex[slackIndex] = -1;

    this.height += 1;
}

export function removeConstraint(this: Tableau, constraint: Constraint): void {
    const slackIndex = constraint.index;
    const lastRow = this.height - 1;

    const r = this.putInBase(slackIndex);

    const tmpRow = this.matrix[lastRow];
    this.matrix[lastRow] = this.matrix[r];
    this.matrix[r] = tmpRow;

    this.varIndexByRow[r] = this.varIndexByRow[lastRow];
    this.varIndexByRow[lastRow] = -1;
    this.rowByVarIndex[slackIndex] = -1;

    this.availableIndexes[this.availableIndexes.length] = slackIndex;

    constraint.slack.index = -1;

    this.height -= 1;
}

export function addVariable(this: Tableau, variable: Variable): void {
    const lastRow = this.height - 1;
    const lastColumn = this.width;
    const cost = this.model.isMinimization === true ? -variable.cost : variable.cost;
    const priority = variable.priority;

    const nOptionalObjectives = this.optionalObjectives.length;
    if (nOptionalObjectives > 0) {
        for (let o = 0; o < nOptionalObjectives; o += 1) {
            this.optionalObjectives[o].reducedCosts[lastColumn] = 0;
        }
    }

    if (priority === 0) {
        this.matrix[0][lastColumn] = cost;
    } else {
        this.setOptionalObjective(priority, lastColumn, cost);
        this.matrix[0][lastColumn] = 0;
    }

    for (let r = 1; r <= lastRow; r += 1) {
        this.matrix[r][lastColumn] = 0;
    }
    this.colByVarIndex[variable.index] = lastColumn;
    this.varIndexByCol[lastColumn] = variable.index;

    this.width += 1;
}

export function removeVariable(this: Tableau, variable: Variable): void {
    const varIndex = variable.index;
    const lastColumn = this.width - 1;

    const c = this.takeOutOfBase(varIndex);

    const lastRow = this.height - 1;
    for (let r = 0; r <= lastRow; r += 1) {
        const row = this.matrix[r];
        row[c] = row[lastColumn];
    }

    this.varIndexByCol[c] = this.varIndexByCol[lastColumn];
    this.rowByVarIndex[varIndex] = -1;
    this.colByVarIndex[varIndex] = -1;

    this.availableIndexes[this.availableIndexes.length] = varIndex;

    this.width -= 1;
}
