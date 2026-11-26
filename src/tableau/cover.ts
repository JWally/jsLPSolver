/**
 * @file src/tableau/cover.ts
 * @description Lifted knapsack cover cuts from all-binary rows
 *
 * A row sum_j a_j x_j <= b over binaries becomes a knapsack
 * sum_j w_j z_j <= c with w_j > 0 by complementing the variables with
 * negative coefficients (z = 1 - x). A cover is a set C with
 * sum_{j in C} w_j > c: not all of C can be 1, so
 *
 *     sum_{j in C} z_j <= |C| - 1.
 *
 * The cover is chosen greedily to be violated at the LP point (items with z*
 * near 1 and large weight first) and then made minimal. Variables outside it
 * are lifted by Balas's rule (1975): with the cover's weights sorted
 * decreasingly and mu_h the sum of the h largest, a variable with
 * mu_h <= w_j < mu_{h+1} gets coefficient h. That is valid for any cover and
 * needs no optimisation.
 *
 * Typical source: "y = 1 forces enough of x_1..x_k" rows (M y - sum a x <= c),
 * where the cover cut reads y <= sum_{j in S} x_j (MIPLIB p0548).
 */
import type { Cut, SparseRow } from "./mir";

/** Bounds, LP value and integrality of one variable. */
export interface CoverVariable {
    lb: number;
    ub: number;
    x: number;
    integer: boolean;
}

const EPS = 1e-9;
const MIN_VIOLATION = 1e-6;

/**
 * A lifted cover cut from one row at the LP point, or null if the row is not
 * an all-binary knapsack or no violated cover is found.
 */
export function separateCoverCut(
    row: SparseRow,
    variableData: (v: number) => CoverVariable
): Cut | null {
    let capacity = row.rhs;
    const index: number[] = [];
    const weight: number[] = [];
    const complemented: boolean[] = [];
    const z: number[] = [];
    let total = 0;
    for (let k = 0; k < row.index.length; k++) {
        const a = row.coef[k];
        if (a > -1e-12 && a < 1e-12) continue;
        const v = row.index[k];
        const d = variableData(v);
        if (d.ub - d.lb < EPS) {
            capacity -= a * d.lb; // fixed
            continue;
        }
        if (!d.integer || d.lb !== 0 || d.ub !== 1) return null;
        index.push(v);
        if (a > 0) {
            weight.push(a);
            complemented.push(false);
            z.push(d.x);
            total += a;
        } else {
            // a x = a - a z with z = 1 - x
            capacity -= a;
            weight.push(-a);
            complemented.push(true);
            z.push(1 - d.x);
            total -= a;
        }
    }
    const n = index.length;
    const tolerance = EPS * Math.max(1, Math.abs(capacity));
    if (n < 2 || capacity < -tolerance || total <= capacity + tolerance) return null;

    // Greedy cover: cheapest loss of violation per unit of weight first.
    const order = Array.from({ length: n }, (_, k) => k).sort(
        (p, q) => (1 - z[p]) / weight[p] - (1 - z[q]) / weight[q] || weight[q] - weight[p] || p - q
    );
    const inCover = new Uint8Array(n);
    let sum = 0;
    for (const k of order) {
        inCover[k] = 1;
        sum += weight[k];
        if (sum > capacity + tolerance) break;
    }
    if (sum <= capacity + tolerance) return null;
    // Minimal cover: drop members with the smallest z* while it stays a cover.
    const members = order.filter((k) => inCover[k] === 1).sort((p, q) => z[p] - z[q] || p - q);
    for (const k of members) {
        if (sum - weight[k] > capacity + tolerance) {
            inCover[k] = 0;
            sum -= weight[k];
        }
    }
    let size = 0;
    let lhs = 0;
    const coverWeights: number[] = [];
    for (let k = 0; k < n; k++) {
        if (inCover[k] === 0) continue;
        size++;
        lhs += z[k];
        coverWeights.push(weight[k]);
    }
    if (size < 2) return null;

    // Balas lifting for variables outside the cover.
    coverWeights.sort((p, q) => q - p);
    const mu: number[] = [0];
    for (const w of coverWeights) mu.push(mu[mu.length - 1] + w);
    const coefficient = new Float64Array(n);
    for (let k = 0; k < n; k++) {
        if (inCover[k] === 1) {
            coefficient[k] = 1;
            continue;
        }
        let h = 0;
        while (h + 1 < mu.length && mu[h + 1] <= weight[k] + tolerance) h++;
        coefficient[k] = h;
        lhs += h * z[k];
    }
    const violation = lhs - (size - 1);
    if (violation <= MIN_VIOLATION) return null;

    // Back to x: z = x keeps the coefficient; z = 1 - x negates it and moves it right.
    const alpha = new Map<number, number>();
    let beta = size - 1;
    let normSq = 0;
    for (let k = 0; k < n; k++) {
        const g = coefficient[k];
        if (g === 0) continue;
        if (complemented[k]) {
            alpha.set(index[k], -g);
            beta -= g;
        } else {
            alpha.set(index[k], g);
        }
        normSq += g * g;
    }
    return { alpha, beta, efficacy: violation / Math.sqrt(normSq) };
}
