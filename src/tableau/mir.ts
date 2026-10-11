/**
 * @file src/tableau/mir.ts
 * @description Complemented mixed-integer rounding (c-MIR) cuts on the original rows
 *
 * Marchand and Wolsey (2001): take a row sum_j a_j x_j <= b (or an
 * aggregation of a few rows that eliminates continuous variables strictly
 * inside their bounds), substitute every variable by a bound so that it is
 * nonnegative (integers possibly complemented to their upper bound), relax
 * continuous terms with positive coefficient, divide by a candidate delta and
 * apply mixed-integer rounding:
 *
 *   sum_int F(a_j / delta) y_j - s / (delta (1 - f0)) <= floor(beta / delta),
 *   F(d) = floor(d) + max(0, frac(d) - f0) / (1 - f0),   f0 = frac(beta / delta),
 *
 * where s >= 0 collects the continuous terms with negative coefficient.
 * Knapsack covers and flow covers are special cases, which is why this one
 * separator closes most of the root gap on fixed-charge models (MIPLIB fiber,
 * vpm2, qnet1) where Gomory cuts barely move the bound.
 *
 * Rows are captured in x-space right after root presolve, while the tableau
 * still holds them, so cuts are globally valid. A cut sum_j alpha_j x_j <= beta
 * is then mapped into the current tableau by substituting each basic
 * variable's row (addLinearCut).
 */
import type Tableau from "./tableau";
import { actualValue, lowerBoundOf, upperBoundOf } from "./bounds";
import { appendCutTableauRow } from "./gomory";

/** A row sum_j coef[k] x_{index[k]} <= rhs over structural variables. */
interface SparseRow {
    index: number[];
    coef: number[];
    rhs: number;
}

export interface OriginalRows {
    rows: SparseRow[];
    /** Rows containing each structural variable. */
    rowsOf: Map<number, number[]>;
    /**
     * Variable upper bounds x <= u y (x continuous, y integer), from rows
     * a x + c y <= 0 with a > 0 > c: the substitution behind flow covers.
     */
    vub: Map<number, { y: number; u: number }>;
}

const MIN_FRACTION = 0.05;
const MAX_AGGREGATIONS = 3;
const MAX_DELTAS = 8;
const MIN_EFFICACY = 1e-4;
const EPS = 1e-9;

/**
 * Capture the rows of a fresh tableau (every structural nonbasic, every row
 * slack basic) in x-space. Rows touching free variables are skipped.
 */
export function captureOriginalRows(tableau: Tableau): OriginalRows | null {
    const model = tableau.model;
    if (!model) return null;
    for (const variable of model.variables) {
        if (tableau.colByVarIndex[variable.index] === -1) return null; // not fresh
    }
    const width = tableau.width;
    const matrix = tableau.matrix;
    const rows: SparseRow[] = [];
    const rowsOf = new Map<number, number[]>();
    const vub = new Map<number, { y: number; u: number }>();
    for (let r = 1; r < tableau.height; r++) {
        const offset = r * width;
        const index: number[] = [];
        const coef: number[] = [];
        // Row form slack = b - sum a s >= 0, i.e. sum a s <= b, with s = sign (x - o).
        let rhs = matrix[offset];
        let free = false;
        for (let c = 1; c < width; c++) {
            const a = matrix[offset + c];
            if (a === 0) continue;
            const v = tableau.varIndexByCol[c];
            if (tableau.unrestrictedVars[v] === true) {
                free = true;
                break;
            }
            const sign = tableau.boundSign[v] ?? 1;
            const o = tableau.boundOffset[v] ?? 0;
            const ax = a * sign;
            index.push(v);
            coef.push(ax);
            rhs += ax * o;
        }
        if (free || index.length === 0) continue;
        if (index.length === 2 && Math.abs(rhs) < 1e-12) {
            for (let k = 0; k < 2; k++) {
                const x = index[k];
                const y = index[1 - k];
                const isInt = (v: number) => tableau.variablesPerIndex[v]?.isInteger === true;
                if (!isInt(x) && isInt(y) && coef[k] > 0 && coef[1 - k] < 0) {
                    const u = -coef[1 - k] / coef[k];
                    const known = vub.get(x);
                    if (known === undefined || u < known.u) vub.set(x, { y, u });
                }
            }
        }
        const id = rows.length;
        rows.push({ index, coef, rhs });
        for (const v of index) {
            let list = rowsOf.get(v);
            if (list === undefined) rowsOf.set(v, (list = []));
            list.push(id);
        }
    }
    return { rows, rowsOf, vub };
}

interface VariableData {
    lb: number;
    ub: number;
    x: number;
    integer: boolean;
}

/** A cut sum alpha_j x_j <= beta with its efficacy at the LP point. */
interface Cut {
    alpha: Map<number, number>;
    beta: number;
    efficacy: number;
}

/**
 * Separate c-MIR cuts from the captured rows at the current LP optimum and
 * append up to `maxCuts` of the most efficacious ones to the tableau.
 *
 * @returns The number of cuts added.
 */
export function addMirCuts(tableau: Tableau, original: OriginalRows, maxCuts: number): number {
    const model = tableau.model;
    if (!model || maxCuts <= 0) return 0;
    const data = new Map<number, VariableData>();
    const variableData = (v: number): VariableData => {
        let d = data.get(v);
        if (d === undefined) {
            const variable = tableau.variablesPerIndex[v];
            const integer = variable?.isInteger === true;
            let lb = lowerBoundOf(tableau, v);
            let ub = upperBoundOf(tableau, v);
            if (integer) {
                lb = Math.ceil(lb - EPS);
                ub = Math.floor(ub + EPS);
            }
            d = { lb, ub, x: actualValue(tableau, v), integer };
            data.set(v, d);
        }
        return d;
    };

    const cuts: Cut[] = [];
    for (let r = 0; r < original.rows.length; r++) {
        const cut = separateFromRow(original, r, variableData);
        if (cut !== null) cuts.push(cut);
    }
    cuts.sort((p, q) => q.efficacy - p.efficacy);
    let added = 0;
    for (let k = 0; k < cuts.length && added < maxCuts; k++) {
        if (addLinearCut(tableau, cuts[k].alpha, cuts[k].beta)) added++;
    }
    return added;
}

/** Best c-MIR cut from row r, aggregating along continuous variables if needed. */
function separateFromRow(
    original: OriginalRows,
    start: number,
    variableData: (v: number) => VariableData
): Cut | null {
    // Aggregated row as a dense map.
    const row = new Map<number, number>();
    const base = original.rows[start];
    for (let k = 0; k < base.index.length; k++) row.set(base.index[k], base.coef[k]);
    let rhs = base.rhs;
    const used = new Set<number>([start]);

    let best: Cut | null = null;
    for (let aggregation = 0; aggregation <= MAX_AGGREGATIONS; aggregation++) {
        const cut = cmir(row, rhs, variableData, original.vub);
        if (cut !== null && (best === null || cut.efficacy > best.efficacy)) best = cut;
        if (aggregation === MAX_AGGREGATIONS) break;
        // Eliminate the continuous variable farthest from its bounds.
        let pick = -1;
        let pickDistance = EPS;
        for (const [v, a] of row) {
            if (Math.abs(a) < EPS) continue;
            const d = variableData(v);
            if (d.integer) continue;
            const distance = Math.min(d.x - d.lb, d.ub - d.x);
            if (distance > pickDistance) {
                pickDistance = distance;
                pick = v;
            }
        }
        if (pick === -1) break;
        const a = row.get(pick)!;
        let partner = -1;
        let lambda = 0;
        for (const id of original.rowsOf.get(pick) ?? []) {
            if (used.has(id)) continue;
            const other = original.rows[id];
            const k = other.index.indexOf(pick);
            const b = other.coef[k];
            // Only nonnegative multiples of <= rows may be added.
            if (b === 0 || Math.sign(b) === Math.sign(a)) continue;
            partner = id;
            lambda = -a / b;
            break;
        }
        if (partner === -1) break;
        used.add(partner);
        const other = original.rows[partner];
        for (let k = 0; k < other.index.length; k++) {
            const v = other.index[k];
            const value = (row.get(v) ?? 0) + lambda * other.coef[k];
            if (Math.abs(value) < 1e-12) row.delete(v);
            else row.set(v, value);
        }
        row.delete(pick);
        rhs += lambda * other.rhs;
    }
    return best;
}

/**
 * c-MIR on one (aggregated) row sum a_v x_v <= rhs. Returns the most
 * efficacious violated cut over the candidate deltas and complementations.
 */
function cmir(
    row: Map<number, number>,
    rhs: number,
    variableData: (v: number) => VariableData,
    vub: Map<number, { y: number; u: number }>
): Cut | null {
    // Bound substitution. Continuous: x = lb + x' or x = ub - x' (closest
    // bound); keep only negative coefficients (s = sum -c x' >= 0).
    let beta = rhs;
    const contIndex: number[] = [];
    const contCoef: number[] = []; // coefficient c on x' (< 0 kept)
    const contAtUpper: boolean[] = [];
    const contVub: Array<{ y: number; u: number } | null> = [];
    let sStar = 0;
    const integerPart = new Map<number, number>();
    for (const [v, a] of row) {
        if (a === 0) continue;
        const d = variableData(v);
        if (d.integer) {
            integerPart.set(v, (integerPart.get(v) ?? 0) + a);
            continue;
        }
        // Variable upper bound x <= u y when it is the closest bound:
        // x = u y - x' moves a u onto y and leaves -a on x' >= 0 (relaxed
        // away when -a > 0, which is the flow-cover case for inflows).
        const variableBound = vub.get(v);
        if (variableBound !== undefined) {
            const yData = variableData(variableBound.y);
            const vubDistance = Math.max(0, variableBound.u * yData.x - d.x);
            if (vubDistance < d.x - d.lb && (d.ub === Infinity || vubDistance < d.ub - d.x)) {
                integerPart.set(
                    variableBound.y,
                    (integerPart.get(variableBound.y) ?? 0) + a * variableBound.u
                );
                if (a > 0) {
                    contIndex.push(v);
                    contCoef.push(-a);
                    contAtUpper.push(false);
                    contVub.push(variableBound);
                    sStar += a * vubDistance;
                }
                continue;
            }
        }
        const useUpper = d.lb === -Infinity || (d.ub !== Infinity && d.ub - d.x < d.x - d.lb);
        if (useUpper && d.ub === Infinity) return null;
        const bound = useUpper ? d.ub : d.lb;
        beta -= a * bound;
        const c = useUpper ? -a : a;
        if (c >= 0) continue; // relaxed away
        contIndex.push(v);
        contCoef.push(c);
        contAtUpper.push(useUpper);
        contVub.push(null);
        sStar += -c * (useUpper ? d.ub - d.x : d.x - d.lb);
    }
    const intIndex: number[] = [];
    const intCoef: number[] = [];
    for (const [v, a] of integerPart) {
        if (Math.abs(a) < 1e-12) continue;
        if (variableData(v).lb === -Infinity) return null;
        intIndex.push(v);
        intCoef.push(a);
    }
    if (intIndex.length === 0) return null;

    // Integers shifted to their lower bound: y = x - lb in [0, u'].
    const n = intIndex.length;
    const y = new Float64Array(n);
    const yUb = new Float64Array(n);
    let shift = 0;
    for (let k = 0; k < n; k++) {
        const d = variableData(intIndex[k]);
        y[k] = d.x - d.lb;
        yUb[k] = d.ub - d.lb;
        shift += intCoef[k] * d.lb;
    }
    const betaShifted = beta - shift;

    // Candidate deltas: |a| of integers strictly between their bounds.
    const deltas: number[] = [];
    for (let k = 0; k < n; k++) {
        if (y[k] <= EPS || y[k] >= yUb[k] - EPS) continue;
        const delta = Math.abs(intCoef[k]);
        if (delta > EPS && !deltas.some((d) => Math.abs(d - delta) < 1e-9 * delta)) {
            deltas.push(delta);
            if (deltas.length >= MAX_DELTAS) break;
        }
    }
    if (deltas.length === 0) return null;

    const complemented = new Uint8Array(n);
    const evaluate = (delta: number): Cut | null =>
        mirCut(
            intIndex,
            intCoef,
            y,
            yUb,
            complemented,
            betaShifted,
            delta,
            contIndex,
            contCoef,
            contAtUpper,
            contVub,
            sStar,
            variableData
        );

    let best: Cut | null = null;
    let bestDelta = 0;
    for (const delta of deltas) {
        const cut = evaluate(delta);
        if (cut !== null && (best === null || cut.efficacy > best.efficacy)) {
            best = cut;
            bestDelta = delta;
        }
    }
    if (best === null) return null;
    for (const divisor of [2, 4, 8]) {
        const cut = evaluate(bestDelta / divisor);
        if (cut !== null && cut.efficacy > best.efficacy) best = cut;
    }
    // Complement integers above their midpoint, one at a time, while it helps.
    const order = Array.from({ length: n }, (_, k) => k)
        .filter((k) => yUb[k] !== Infinity && y[k] > yUb[k] / 2)
        .sort((p, q) => yUb[q] - y[q] - (yUb[p] - y[p]) || p - q);
    for (const k of order) {
        complemented[k] = 1;
        const cut = evaluate(bestDelta);
        if (cut !== null && cut.efficacy > best.efficacy) best = cut;
        else complemented[k] = 0;
    }
    return best;
}

/** The MIR cut for one delta and complementation, in x-space, or null. */
function mirCut(
    intIndex: number[],
    intCoef: number[],
    y: Float64Array,
    yUb: Float64Array,
    complemented: Uint8Array,
    betaShifted: number,
    delta: number,
    contIndex: number[],
    contCoef: number[],
    contAtUpper: boolean[],
    contVub: Array<{ y: number; u: number } | null>,
    sStar: number,
    variableData: (v: number) => VariableData
): Cut | null {
    const n = intIndex.length;
    // Complementing y = u' - y' flips the coefficient and moves a * u' to the rhs.
    let beta = betaShifted;
    for (let k = 0; k < n; k++) if (complemented[k]) beta -= intCoef[k] * yUb[k];
    const scaled = beta / delta;
    const f0 = scaled - Math.floor(scaled);
    if (f0 < MIN_FRACTION || f0 > 1 - MIN_FRACTION) return null;
    const gamma = Math.floor(scaled);
    const h = 1 / (delta * (1 - f0));

    // Cut in (y', s): sum g_k y'_k - h s <= gamma.
    const alpha = new Map<number, number>();
    let betaX = gamma;
    let lhsStar = 0;
    let normSq = 0;
    for (let k = 0; k < n; k++) {
        const a = complemented[k] ? -intCoef[k] : intCoef[k];
        const d = a / delta;
        const fd = d - Math.floor(d);
        const g = Math.floor(d) + Math.max(0, fd - f0) / (1 - f0);
        if (g === 0) continue;
        const v = intIndex[k];
        const lb = variableData(v).lb;
        const yValue = complemented[k] ? yUb[k] - y[k] : y[k];
        lhsStar += g * yValue;
        // y' = x - lb, or y' = u' - (x - lb) = ub - x when complemented.
        if (complemented[k]) {
            alpha.set(v, (alpha.get(v) ?? 0) - g);
            betaX -= g * (lb + yUb[k]);
        } else {
            alpha.set(v, (alpha.get(v) ?? 0) + g);
            betaX += g * lb;
        }
    }
    lhsStar -= h * sStar;
    // -h s = -h sum (-c) x' with x' = x - lb or ub - x.
    for (let k = 0; k < contIndex.length; k++) {
        const v = contIndex[k];
        const w = -h * -contCoef[k]; // coefficient on x' in the cut (<= 0)
        const d = variableData(v);
        const bound = contVub[k];
        if (bound !== null) {
            // x' = u y - x
            alpha.set(bound.y, (alpha.get(bound.y) ?? 0) + w * bound.u);
            alpha.set(v, (alpha.get(v) ?? 0) - w);
        } else if (contAtUpper[k]) {
            alpha.set(v, (alpha.get(v) ?? 0) - w);
            betaX -= w * d.ub;
        } else {
            alpha.set(v, (alpha.get(v) ?? 0) + w);
            betaX += w * d.lb;
        }
    }
    const violation = lhsStar - gamma;
    if (violation <= 1e-6 * Math.max(1, Math.abs(gamma))) return null;
    for (const value of alpha.values()) normSq += value * value;
    if (normSq === 0) return null;
    const efficacy = violation / Math.sqrt(normSq);
    if (efficacy < MIN_EFFICACY) return null;
    return { alpha, beta: betaX, efficacy };
}

/**
 * Append sum_j alpha_j x_j <= beta (structural variables) to the current
 * tableau: its slack t = beta - sum alpha x is written in the nonbasic
 * stored variables by substituting basic variables' rows.
 *
 * @returns False if the cut is numerically unusable.
 */
export function addLinearCut(tableau: Tableau, alpha: Map<number, number>, beta: number): boolean {
    const width = tableau.width;
    const matrix = tableau.matrix;
    const row = new Float64Array(width);
    let rhs = beta;
    for (const [v, a] of alpha) {
        if (a === 0) continue;
        rhs -= a * actualValue(tableau, v);
        const sign = tableau.boundSign[v] ?? 1;
        const col = tableau.colByVarIndex[v];
        if (col !== -1 && col !== undefined) {
            row[col] += a * sign;
        } else {
            const r = tableau.rowByVarIndex[v];
            const offset = r * width;
            for (let c = 1; c < width; c++) {
                const m = matrix[offset + c];
                if (m !== 0) row[c] -= a * sign * m;
            }
        }
    }
    let largest = 0;
    let smallest = Infinity;
    for (let c = 1; c < width; c++) {
        const m = Math.abs(row[c]);
        if (m < 1e-11) {
            row[c] = 0;
            continue;
        }
        if (m > largest) largest = m;
        if (m < smallest) smallest = m;
    }
    if (largest === 0 || largest / smallest > 1e8) return false;
    appendCutTableauRow(tableau, rhs, row, largest);
    return true;
}
