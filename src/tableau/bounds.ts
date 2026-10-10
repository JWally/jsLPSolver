/**
 * @file src/tableau/bounds.ts
 * @description Column bounds for the tableau (upper-bounding technique)
 *
 * Every variable keeps the classic "nonbasic means stored value 0" invariant
 * by storing an affine image of itself:
 *
 *     x = offset + sign * s,    0 <= s <= range,    sign in {+1, -1}
 *
 * A variable resting at its lower bound has sign +1 and offset = lb; one
 * resting at its upper bound is complemented (sign -1, offset = ub). Changing
 * a bound is a substitution s = alpha + beta * s' applied to the tableau
 * (Dantzig 1955; Chvátal, "Linear Programming", ch. 8), so pivots and the
 * existing phase logic need no knowledge of bounds beyond the range check.
 *
 * Every tableau row, including the cost row, has the form
 *     basic = rhs - sum(a_c * s_c)    over nonbasic columns c,
 * so substitutions apply uniformly to all rows.
 */
import type Tableau from "./tableau";

/** Default range for a variable without a finite upper bound. */
const NO_RANGE = Infinity;

/**
 * Substitute s = alpha + beta * s' for the variable at varIndex (beta = +/-1).
 * Updates the tableau rows and the variable's offset/sign.
 */
export function substituteVariable(
    tableau: Tableau,
    varIndex: number,
    alpha: number,
    beta: number
): void {
    const matrix = tableau.matrix;
    const width = tableau.width;
    const rhsColumn = tableau.rhsColumn;
    const row = tableau.rowByVarIndex[varIndex];

    if (row !== -1 && row !== undefined) {
        // basic: s = rhs - sum(a x)  =>  s' = (rhs - alpha) * beta - sum(beta a x)
        const rowOffset = row * width;
        matrix[rowOffset + rhsColumn] = (matrix[rowOffset + rhsColumn] - alpha) * beta;
        if (beta === -1) {
            for (let c = 1; c < width; c++) {
                matrix[rowOffset + c] = -matrix[rowOffset + c];
            }
        }
    } else {
        // nonbasic in column col: every row's rhs absorbs a * alpha
        const col = tableau.colByVarIndex[varIndex];
        const height = tableau.height;
        for (let r = 0; r < height; r++) {
            const idx = r * width + col;
            const a = matrix[idx];
            if (a !== 0) {
                matrix[r * width + rhsColumn] -= a * alpha;
                if (beta === -1) matrix[idx] = -a;
            }
        }
    }

    const sign = tableau.boundSign[varIndex] ?? 1;
    tableau.boundOffset[varIndex] = (tableau.boundOffset[varIndex] ?? 0) + sign * alpha;
    tableau.boundSign[varIndex] = sign * beta;
}

/**
 * Set the actual bounds lb <= x <= ub of a variable (lb finite).
 *
 * A nonbasic variable resting at its upper bound stays there (so a
 * dual-feasible basis stays dual feasible); otherwise the variable is
 * re-anchored at its new lower bound.
 *
 * @returns False if the bounds are empty (lb > ub), which makes the node infeasible.
 */
export function setVariableBounds(
    tableau: Tableau,
    varIndex: number,
    lb: number,
    ub: number
): boolean {
    if (lb > ub + tableau.precision) {
        return false;
    }
    tableau.hasBounds = true;

    const offset = tableau.boundOffset[varIndex] ?? 0;
    const sign = tableau.boundSign[varIndex] ?? 1;
    const isBasic = tableau.rowByVarIndex[varIndex] !== -1;

    let alpha: number;
    let beta: number;
    if (!isBasic && sign === -1 && ub !== Infinity) {
        // keep at upper bound: x = offset - s = ub - s'
        alpha = offset - ub;
        beta = 1;
    } else if (sign === 1) {
        // anchor at lower bound: x = offset + s = lb + s'
        alpha = lb - offset;
        beta = 1;
    } else {
        // complemented, re-anchor at lower bound: x = offset - s = lb + s'
        alpha = offset - lb;
        beta = -1;
    }
    if (alpha !== 0 || beta !== 1) {
        substituteVariable(tableau, varIndex, alpha, beta);
    }

    tableau.boundLower[varIndex] = lb;
    tableau.boundUpper[varIndex] = ub;
    tableau.boundRange[varIndex] = ub - lb;
    return true;
}

/** Current lower bound of a variable (0 unless changed). */
export function lowerBoundOf(tableau: Tableau, varIndex: number): number {
    return tableau.boundLower[varIndex] ?? 0;
}

/** Current upper bound of a variable (Infinity unless changed). */
export function upperBoundOf(tableau: Tableau, varIndex: number): number {
    return tableau.boundUpper[varIndex] ?? Infinity;
}

/** Range (ub - lb) of the stored variable, Infinity when unbounded above. */
export function rangeOf(tableau: Tableau, varIndex: number): number {
    return tableau.boundRange[varIndex] ?? NO_RANGE;
}

/** Actual value x of a variable given the current basis. */
export function actualValue(tableau: Tableau, varIndex: number): number {
    const row = tableau.rowByVarIndex[varIndex];
    const stored =
        row !== -1 && row !== undefined
            ? tableau.matrix[row * tableau.width + tableau.rhsColumn]
            : 0;
    return (tableau.boundOffset[varIndex] ?? 0) + (tableau.boundSign[varIndex] ?? 1) * stored;
}

/** Actual value of a basic variable from its stored value. */
export function toActual(tableau: Tableau, varIndex: number, stored: number): number {
    if (!tableau.hasBounds) return stored;
    return (tableau.boundOffset[varIndex] ?? 0) + (tableau.boundSign[varIndex] ?? 1) * stored;
}

/**
 * Complement the basic variable of a row that sits above its range, turning
 * the violation into an ordinary negative right-hand side.
 */
export function flipRowToUpper(tableau: Tableau, row: number): void {
    const varIndex = tableau.varIndexByRow[row];
    substituteVariable(tableau, varIndex, rangeOf(tableau, varIndex), -1);
}

/**
 * Complement a nonbasic variable that moves to its upper bound (bound flip).
 */
export function flipColumnToUpper(tableau: Tableau, column: number): void {
    const varIndex = tableau.varIndexByCol[column];
    substituteVariable(tableau, varIndex, rangeOf(tableau, varIndex), -1);
}

/** State captured with snapshots and saved tableaux. */
export interface BoundState {
    hasBounds: boolean;
    offset: number[];
    sign: number[];
    range: number[];
    lower: number[];
    upper: number[];
}

/** Capture the bound state (cheap when no bounds were ever set). */
export function captureBounds(tableau: Tableau): BoundState | null {
    if (!tableau.hasBounds) return null;
    return {
        hasBounds: true,
        offset: tableau.boundOffset.slice(),
        sign: tableau.boundSign.slice(),
        range: tableau.boundRange.slice(),
        lower: tableau.boundLower.slice(),
        upper: tableau.boundUpper.slice(),
    };
}

/** Restore a captured bound state (null resets to no bounds). */
export function restoreBounds(tableau: Tableau, state: BoundState | null): void {
    if (state === null) {
        if (tableau.hasBounds) {
            tableau.hasBounds = false;
            tableau.boundOffset = [];
            tableau.boundSign = [];
            tableau.boundRange = [];
            tableau.boundLower = [];
            tableau.boundUpper = [];
        }
        return;
    }
    tableau.hasBounds = true;
    tableau.boundOffset = state.offset.slice();
    tableau.boundSign = state.sign.slice();
    tableau.boundRange = state.range.slice();
    tableau.boundLower = state.lower.slice();
    tableau.boundUpper = state.upper.slice();
}
