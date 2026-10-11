/**
 * @file src/tableau/root-presolve.ts
 * @description Bound propagation and coefficient tightening on the root tableau
 *
 * Runs on a freshly built tableau (every structural variable nonbasic, every
 * row slack basic), where row r reads sum_j a_rj s_j <= b_r over stored
 * variables s_j in [0, range_j] (bounds.ts shifts and complements each
 * variable so it sits at zero).
 *
 * - Bound propagation (activity-based, as in every MIP presolve): the row's
 *   minimum activity without s_j bounds s_j above (a_rj > 0) or below
 *   (a_rj < 0). Integer bounds are rounded inward. Implied bounds never change
 *   the feasible set, only make it explicit.
 * - Coefficient tightening (Savelsbergh 1994): for a binary s_k whose row is
 *   redundant at one of its values, the coefficient (and right-hand side) can
 *   shrink so the row stays the same at both values while the LP relaxation
 *   tightens. The classic case is a big-M row x - M y <= 0 with x <= u:
 *   M shrinks to u.
 *
 * It works on internal tableau rows only, so the user's model is untouched.
 */
import type Tableau from "./tableau";
import { lowerBoundOf, rangeOf, setVariableBounds, upperBoundOf } from "./bounds";

const MAX_PASSES = 10;
const MAX_CHANGES_PER_ROW = 50;
/** Coefficients smaller than this are ignored (too weak to propagate safely). */
const MIN_COEFFICIENT = 1e-9;
/** A bound must move by at least this (relative to max(1, |bound|)) to be applied. */
const MIN_IMPROVEMENT = 1e-6;
/** Activities beyond this are treated as unbounded. */
const HUGE = 1e15;

export interface RootPresolveResult {
    /** False if propagation proved the bounds empty. */
    feasible: boolean;
    tightenedBounds: number;
    tightenedCoefficients: number;
}

/**
 * Tighten bounds and big-M coefficients of a fresh tableau in place.
 * Does nothing unless every structural column is nonbasic.
 */
export function presolveRootTableau(tableau: Tableau): RootPresolveResult {
    const result: RootPresolveResult = {
        feasible: true,
        tightenedBounds: 0,
        tightenedCoefficients: 0,
    };
    const model = tableau.model;
    if (!model) return result;
    const width = tableau.width;
    const height = tableau.height;
    for (const variable of model.variables) {
        if (tableau.colByVarIndex[variable.index] === -1) return result; // not fresh
    }

    const isInteger = new Uint8Array(width);
    for (let c = 1; c < width; c++) {
        const v = tableau.varIndexByCol[c];
        const offset = v < tableau.boundOffset.length ? tableau.boundOffset[v] : 0;
        if (tableau.variablesPerIndex[v]?.isInteger === true && Number.isInteger(offset)) {
            isInteger[c] = 1;
        }
    }
    // Rows touching a free column are skipped: the reasoning assumes every
    // nonbasic stored variable is >= 0.
    const freeColumns: number[] = [];
    for (let c = 1; c < width; c++) {
        if (tableau.unrestrictedVars[tableau.varIndexByCol[c]] === true) freeColumns.push(c);
    }
    const usableRow = (r: number): boolean => {
        const v = tableau.varIndexByRow[r];
        if (tableau.unrestrictedVars[v] === true || rangeOf(tableau, v) !== Infinity) return false;
        const rowOffset = r * width;
        for (let i = 0; i < freeColumns.length; i++) {
            if (tableau.matrix[rowOffset + freeColumns[i]] !== 0) return false;
        }
        return true;
    };

    for (let pass = 0; pass < MAX_PASSES; pass++) {
        let changed = false;
        for (let r = 1; r < height && result.feasible; r++) {
            if (!usableRow(r)) continue;
            // Each call applies at most one bound (the row's data then changes).
            for (let k = 0; k < MAX_CHANGES_PER_ROW; k++) {
                if (!propagateRow(tableau, r, isInteger, result) || !result.feasible) break;
                changed = true;
            }
        }
        if (!result.feasible || !changed) break;
    }
    if (!result.feasible) return result;

    for (let r = 1; r < height; r++) {
        if (!usableRow(r)) continue;
        tightenRowCoefficients(tableau, r, isInteger, result);
    }
    return result;
}

/** One propagation sweep over row r; returns whether any bound moved. */
function propagateRow(
    tableau: Tableau,
    r: number,
    isInteger: Uint8Array,
    result: RootPresolveResult
): boolean {
    const width = tableau.width;
    const matrix = tableau.matrix;
    const rowOffset = r * width;

    // Minimum activity over s in [0, range]: only negative coefficients count.
    let minActivity = 0;
    let infinite = 0;
    for (let c = 1; c < width; c++) {
        const a = matrix[rowOffset + c];
        if (a >= -MIN_COEFFICIENT) continue;
        const range = rangeOf(tableau, tableau.varIndexByCol[c]);
        if (range === Infinity || range > HUGE) infinite++;
        else minActivity += a * range;
    }
    if (infinite > 1) return false;

    let changed = false;
    for (let c = 1; c < width; c++) {
        const a = matrix[rowOffset + c];
        if (a < MIN_COEFFICIENT && a > -MIN_COEFFICIENT) continue;
        const v = tableau.varIndexByCol[c];
        const range = rangeOf(tableau, v);
        const ownInfinite = a < 0 && (range === Infinity || range > HUGE);
        if (infinite - (ownInfinite ? 1 : 0) > 0) continue;
        const rest = minActivity - (a < 0 && !ownInfinite ? a * range : 0);
        const slack = matrix[rowOffset] - rest; // sum_{this} a s <= slack
        let lower = 0;
        let upper = range;
        if (a > 0) upper = Math.min(upper, slack / a);
        else lower = slack / a;
        if (isInteger[c]) {
            upper = Math.floor(upper + 1e-9);
            lower = Math.ceil(lower - 1e-9);
        }
        const raiseLower = lower > MIN_IMPROVEMENT * Math.max(1, Math.abs(lower));
        const cutUpper = upper < range - MIN_IMPROVEMENT * Math.max(1, Math.abs(upper));
        if (!raiseLower && !cutUpper) continue;
        if (lower > upper + 1e-9) {
            result.feasible = false;
            return changed;
        }
        // Stored s maps to x = offset + sign * s.
        const sign = tableau.boundSign[v] ?? 1;
        const offset = tableau.boundOffset[v] ?? 0;
        let lb = lowerBoundOf(tableau, v);
        let ub = upperBoundOf(tableau, v);
        const newLo = raiseLower ? lower : 0;
        const newHi = cutUpper ? upper : range;
        if (sign === 1) {
            lb = Math.max(lb, offset + newLo);
            ub = Math.min(ub, offset + newHi);
        } else {
            lb = Math.max(lb, offset - newHi);
            ub = Math.min(ub, offset - newLo);
        }
        if (!setVariableBounds(tableau, v, lb, Math.max(lb, ub))) {
            result.feasible = false;
            return changed;
        }
        result.tightenedBounds++;
        changed = true;
        return changed; // row data changed; the next pass recomputes it
    }
    return changed;
}

/** Shrink big-M coefficients of binary columns in row r (one per pass, rows recomputed). */
function tightenRowCoefficients(
    tableau: Tableau,
    r: number,
    isInteger: Uint8Array,
    result: RootPresolveResult
): void {
    const width = tableau.width;
    const matrix = tableau.matrix;
    const rowOffset = r * width;
    for (let round = 0; round < width; round++) {
        // Maximum activity over s in [0, range]: only positive coefficients count.
        let maxActivity = 0;
        for (let c = 1; c < width; c++) {
            const a = matrix[rowOffset + c];
            if (a <= MIN_COEFFICIENT) continue;
            const range = rangeOf(tableau, tableau.varIndexByCol[c]);
            if (range === Infinity || range > HUGE) return;
            maxActivity += a * range;
        }
        const b = matrix[rowOffset];
        let applied = false;
        for (let c = 1; c < width && !applied; c++) {
            const a = matrix[rowOffset + c];
            if (!isInteger[c] || (a < MIN_COEFFICIENT && a > -MIN_COEFFICIENT)) continue;
            if (rangeOf(tableau, tableau.varIndexByCol[c]) !== 1) continue;
            const tol = 1e-9 * Math.max(1, Math.abs(b));
            if (a > 0) {
                const rest = maxActivity - a;
                // Row redundant at s_k = 0 but binding at s_k = 1.
                if (rest < b - tol && rest + a > b + tol) {
                    const d = b - rest;
                    matrix[rowOffset + c] = a - d;
                    matrix[rowOffset] = b - d;
                    applied = true;
                }
            } else {
                // Row redundant at s_k = 1: shrink |a| until it just is.
                const tightened = b - maxActivity;
                if (maxActivity > b + tol && tightened > a + tol) {
                    matrix[rowOffset + c] = tightened;
                    applied = true;
                }
            }
        }
        if (!applied) return;
        result.tightenedCoefficients++;
    }
}
