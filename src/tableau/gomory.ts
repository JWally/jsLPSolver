/**
 * @file src/tableau/gomory.ts
 * @description Gomory mixed-integer cuts from the optimal tableau
 *
 * Each tableau row whose basic variable is integer but fractional yields a
 * Gomory mixed-integer (GMI) cut (Gomory 1960; Balas et al. 1996 showed they
 * pay off in branch-and-cut). The dense tableau stores every row of B^-1 A
 * already, so generating a cut costs one pass over the row.
 *
 * Row r reads s_B + sum_j a_j s_j = b with every nonbasic s_j >= 0: with
 * column bounds (bounds.ts) each stored variable is shifted and possibly
 * complemented so that it sits at zero, and integer variables keep integer
 * offsets, so integrality carries over to the stored variable. With f0 the
 * fractional part of b and f_j that of a_j, the cut is
 *
 *   sum_{int, f_j <= f0} f_j/f0 s_j + sum_{int, f_j > f0} (1-f_j)/(1-f0) s_j
 *     + sum_{cont, a_j > 0} a_j/f0 s_j + sum_{cont, a_j < 0} -a_j/(1-f0) s_j >= 1.
 *
 * Slack variables are treated as continuous (rows are equilibrated, so
 * their slacks need not be integral), which keeps every cut valid.
 */
import type Tableau from "./tableau";
import { SlackVariable } from "../expressions";
import { rangeOf } from "./bounds";

/** Slack indices created for cut rows, per tableau (only those rows may be removed). */
const cutSlacks = new WeakMap<Tableau, Set<number>>();

/** Rows whose basic value is this close to an integer are not cut. */
const MIN_FRACTION = 0.005;
/** Cuts whose largest/smallest coefficient ratio exceeds this are numerically unsafe. */
const MAX_DYNAMISM = 1e6;
/** Coefficients below this are treated as zero when reading the row. */
const ZERO = 1e-11;

/**
 * Append up to `maxCuts` GMI cuts, from the most fractional integer rows, as
 * new tableau rows whose slack is basic and negative (violated). The basis
 * stays dual feasible, so phase 1 re-optimizes with a few dual pivots.
 *
 * @returns The number of cuts added.
 */
export function addGomoryCuts(tableau: Tableau, maxCuts: number): number {
    const model = tableau.model;
    if (!model || maxCuts <= 0) return 0;
    const width = tableau.width;
    const lastColumn = width - 1;
    const precision = tableau.precision;
    const variablesPerIndex = tableau.variablesPerIndex;
    const varIndexByCol = tableau.varIndexByCol;
    const unrestrictedVars = tableau.unrestrictedVars;

    // Which columns hold an integer variable (stored integral) or a fixed one.
    const columnKind = new Int8Array(width); // 0 continuous, 1 integer, 2 fixed
    for (let c = 1; c <= lastColumn; c++) {
        const v = varIndexByCol[c];
        if (rangeOf(tableau, v) <= precision) {
            columnKind[c] = 2;
            continue;
        }
        const variable = variablesPerIndex[v];
        const offset = v < tableau.boundOffset.length ? tableau.boundOffset[v] : 0;
        if (variable?.isInteger === true && Number.isInteger(offset)) columnKind[c] = 1;
    }

    // Candidate rows: integer basic variables with a fractional value.
    const rows: number[] = [];
    const score: number[] = [];
    const integerVariables = model.integerVariables;
    for (let i = 0; i < integerVariables.length; i++) {
        const v = integerVariables[i].index;
        const row = tableau.rowByVarIndex[v];
        if (row === -1 || row === undefined) continue;
        const offset = v < tableau.boundOffset.length ? tableau.boundOffset[v] : 0;
        if (!Number.isInteger(offset)) continue;
        const value = tableau.matrix[row * width];
        const f0 = value - Math.floor(value);
        if (f0 < MIN_FRACTION || f0 > 1 - MIN_FRACTION) continue;
        rows.push(row);
        score.push(Math.min(f0, 1 - f0));
    }
    const order = rows.map((_, i) => i).sort((i, j) => score[j] - score[i] || rows[i] - rows[j]);

    const cut = new Float64Array(width);
    let added = 0;
    for (let k = 0; k < order.length && added < maxCuts; k++) {
        const row = rows[order[k]];
        const matrix = tableau.matrix;
        const rowOffset = row * width;
        const b = matrix[rowOffset];
        const f0 = b - Math.floor(b);
        let valid = true;
        let largest = 0;
        let smallest = Infinity;
        for (let c = 1; c <= lastColumn; c++) {
            cut[c] = 0;
            const a = matrix[rowOffset + c];
            if (a > -ZERO && a < ZERO) continue;
            const kind = columnKind[c];
            if (kind === 2) continue; // fixed at zero: contributes nothing
            if (unrestrictedVars[varIndexByCol[c]] === true) {
                valid = false; // GMI needs every nonbasic variable >= 0
                break;
            }
            let g: number;
            if (kind === 1) {
                const f = a - Math.floor(a);
                g = f <= f0 ? f / f0 : (1 - f) / (1 - f0);
            } else {
                g = a > 0 ? a / f0 : -a / (1 - f0);
            }
            if (g <= 0) continue;
            cut[c] = g;
            if (g > largest) largest = g;
            if (g < smallest) smallest = g;
        }
        if (!valid || largest === 0 || largest / smallest > MAX_DYNAMISM) continue;
        appendCutRow(tableau, cut, largest);
        added++;
    }
    return added;
}

/**
 * Append sum_j g_j s_j >= 1 as a tableau row with a new basic slack
 * t = sum_j g_j s_j - 1, i.e. t = -1 - sum_j (-g_j) s_j.
 */
function appendCutRow(tableau: Tableau, cut: Float64Array, largest: number): void {
    const row = new Float64Array(tableau.width);
    for (let c = 1; c < tableau.width; c++) row[c] = cut[c] === 0 ? 0 : -cut[c];
    appendCutTableauRow(tableau, -1, row, largest);
}

/**
 * Append a cut row in tableau form, t = rhs - sum_c row[c] s_c with a new
 * basic slack t >= 0 (row[0] is ignored), equilibrated by a power of two so
 * its largest coefficient is near 1. Its slack is registered as a cut slack,
 * so removeSlackCuts may delete the row later.
 *
 * @param largest - Largest |row[c]| (computed by the caller).
 */
export function appendCutTableauRow(
    tableau: Tableau,
    rhs: number,
    rowCoefficients: Float64Array,
    largest: number
): void {
    const width = tableau.width;
    const row = tableau.height;
    const required = (row + 1) * width;
    if (tableau.matrix.length < required) {
        const grown = new Float64Array(Math.ceil(required * 1.5));
        grown.set(tableau.matrix);
        tableau.matrix = grown;
    }
    const matrix = tableau.matrix;
    const scale = Math.pow(2, -Math.ceil(Math.log2(largest)));
    const rowOffset = row * width;
    matrix[rowOffset] = scale * rhs;
    for (let c = 1; c < width; c++) {
        const a = rowCoefficients[c];
        matrix[rowOffset + c] = a === 0 ? 0 : scale * a;
    }
    tableau.height = row + 1;

    const slackIndex = tableau.getNewElementIndex();
    tableau.varIndexByRow[row] = slackIndex;
    tableau.rowByVarIndex[slackIndex] = row;
    tableau.colByVarIndex[slackIndex] = -1;
    tableau.variablesPerIndex[slackIndex] = new SlackVariable("s" + slackIndex, slackIndex);
    if (slackIndex >= tableau.nVars) tableau.nVars = slackIndex + 1;
    let slacks = cutSlacks.get(tableau);
    if (slacks === undefined) {
        slacks = new Set();
        cutSlacks.set(tableau, slacks);
    }
    slacks.add(slackIndex);
    // A recycled index must not inherit another variable's bounds.
    if (slackIndex < tableau.boundRange.length) {
        tableau.boundOffset[slackIndex] = 0;
        tableau.boundSign[slackIndex] = 1;
        tableau.boundRange[slackIndex] = Infinity;
        tableau.boundLower[slackIndex] = 0;
        tableau.boundUpper[slackIndex] = Infinity;
    }
}

/**
 * Delete cut rows at or after `firstCutRow` whose slack is basic and strictly
 * positive: those cuts are not binding at the current optimum, so dropping
 * their rows leaves the basis optimal while making every later pivot
 * cheaper. Binding cuts (slack nonbasic or at zero) stay.
 *
 * @returns The number of rows removed.
 */
export function removeSlackCuts(tableau: Tableau, firstCutRow: number): number {
    const width = tableau.width;
    const matrix = tableau.matrix;
    const varIndexByRow = tableau.varIndexByRow;
    const rowByVarIndex = tableau.rowByVarIndex;
    const slacks = cutSlacks.get(tableau);
    if (slacks === undefined) return 0;
    let write = firstCutRow;
    for (let row = firstCutRow; row < tableau.height; row++) {
        const v = varIndexByRow[row];
        // Only a row whose basic variable is a cut's own slack can go: any
        // other basic variable there would take a real constraint with it.
        if (slacks.has(v) && matrix[row * width] > 1e-6) {
            rowByVarIndex[v] = -1;
            tableau.variablesPerIndex[v] = undefined;
            tableau.availableIndexes.push(v);
            slacks.delete(v);
            continue;
        }
        if (write !== row) {
            matrix.copyWithin(write * width, row * width, (row + 1) * width);
            varIndexByRow[write] = v;
            rowByVarIndex[v] = write;
        }
        write++;
    }
    const removed = tableau.height - write;
    tableau.height = write;
    varIndexByRow.length = write;
    return removed;
}
