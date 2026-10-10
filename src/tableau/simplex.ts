/**
 * @file src/tableau/simplex.ts
 * @description Simplex algorithm implementation
 *
 * Implements the two-phase simplex method for solving linear programs:
 * - Phase 1: Find an initial basic feasible solution (or prove infeasibility)
 * - Phase 2: Optimize the objective function (or prove unboundedness)
 *
 * Functions are designed to be bound to a Tableau instance via `this`.
 * Uses partial pricing for large problems to improve performance.
 */
import type Tableau from "./tableau";
import {
    captureBounds,
    flipColumnToUpper,
    flipRowToUpper,
    rangeOf,
    restoreBounds,
    type BoundState,
} from "./bounds";

/**
 * Optimized cycle detector using hash-based O(1) lookup.
 * The original checkForCycles was O(n²) - comparing every pair against all others.
 * This version uses a Map to track where each (leaving,entering) pair occurred,
 * making duplicate detection O(1) average case.
 */
/**
 * Detects pivot cycles using hash-based O(1) lookups.
 *
 * Tracks all (leaving, entering) pairs seen during simplex pivots.
 * When a duplicate pair is detected, verifies whether the sequence
 * after the first occurrence repeats, confirming a cycle.
 */
class CycleDetector {
    private pairs: Array<[number, number]> = [];
    private positions: Map<string, number[]> = new Map();

    /**
     * Record a pivot and check for cycles.
     * @param leaving - Variable index leaving the basis.
     * @param entering - Variable index entering the basis.
     * @returns [startPosition, cycleLength] if cycle detected, empty array otherwise.
     */
    add(leaving: number, entering: number): number[] {
        const key = `${leaving}_${entering}`;
        const pos = this.pairs.length;
        this.pairs.push([leaving, entering]);

        const prevPositions = this.positions.get(key);
        if (prevPositions === undefined) {
            this.positions.set(key, [pos]);
            return [];
        }

        // Check if any previous occurrence starts a repeating cycle
        for (const startPos of prevPositions) {
            const cycleLength = pos - startPos;
            // Need at least cycleLength more elements to verify
            if (cycleLength > this.pairs.length - pos) {
                continue;
            }

            let cycleFound = true;
            for (
                let i = 1;
                i < cycleLength && startPos + cycleLength + i < this.pairs.length;
                i++
            ) {
                const p1 = this.pairs[startPos + i];
                const p2 = this.pairs[startPos + cycleLength + i];
                if (p1[0] !== p2[0] || p1[1] !== p2[1]) {
                    cycleFound = false;
                    break;
                }
            }

            if (cycleFound) {
                return [startPos, cycleLength];
            }
        }

        prevPositions.push(pos);
        return [];
    }
}

/**
 * Run the full two-phase simplex algorithm.
 *
 * Phase 1 finds a basic feasible solution (or proves infeasibility).
 * Phase 2 optimizes the objective (or proves unboundedness).
 *
 * @returns The tableau instance for chaining.
 */
export function simplex(this: Tableau): Tableau {
    this.bounded = true;
    this.phase1();

    if (this.feasible === true) {
        this.phase2();
    }

    return this;
}

/**
 * Dual simplex algorithm for warm-starting after adding constraints.
 *
 * Use when: The current solution is dual feasible (reduced costs valid) but
 * may be primal infeasible (some RHS values negative). This is common after
 * adding bound constraints in branch-and-cut.
 *
 * Algorithm:
 * 1. Find a basic variable with negative value (leaving variable)
 * 2. Find entering variable using dual ratio test
 * 3. Pivot to restore primal feasibility
 * 4. Repeat until all basic variables are non-negative
 *
 * @returns Number of iterations, or -1 if dual infeasible
 */
export function dualSimplex(this: Tableau): number {
    const matrix = this.matrix;
    const width = this.width;
    const rhsColumn = this.rhsColumn;
    const lastColumn = width - 1;
    const lastRow = this.height - 1;
    const precision = this.precision;
    const negPrecision = -precision;

    let iterations = 0;
    const maxIterations = 10000; // Safety limit

    while (iterations < maxIterations) {
        // Step 1: Find leaving variable (row with most negative RHS)
        let leavingRow = 0;
        let minRHS = negPrecision;

        for (let r = 1; r <= lastRow; r++) {
            const rhsValue = matrix[r * width + rhsColumn];
            if (rhsValue < minRHS) {
                minRHS = rhsValue;
                leavingRow = r;
            }
        }

        // If no negative RHS, we're primal feasible - done!
        if (leavingRow === 0) {
            this.feasible = true;
            this.setEvaluation();
            return iterations;
        }

        // Step 2: Find entering variable using dual ratio test
        // For each non-basic variable j with a_ij < 0 (negative coefficient in leaving row),
        // compute ratio = reduced_cost[j] / |a_ij|
        // Choose the one with minimum ratio (to maintain dual feasibility)
        let enteringColumn = 0;
        let minRatio = Infinity;
        const leavingRowOffset = leavingRow * width;

        for (let c = 1; c <= lastColumn; c++) {
            const coefficient = matrix[leavingRowOffset + c];

            // Only consider columns with negative coefficient in leaving row
            if (coefficient < negPrecision) {
                // Reduced cost is in row 0 (cost row)
                const reducedCost = matrix[c];

                // For minimization, reduced costs should be >= 0 for optimality
                // Ratio test: reducedCost / |coefficient|
                if (reducedCost >= negPrecision) {
                    const ratio = reducedCost / -coefficient;
                    if (ratio < minRatio) {
                        minRatio = ratio;
                        enteringColumn = c;
                    }
                }
            }
        }

        // If no entering column found, the problem is dual infeasible (primal unbounded)
        if (enteringColumn === 0) {
            this.feasible = false;
            return -1;
        }

        // Step 3: Pivot
        this.pivot(leavingRow, enteringColumn);
        iterations++;
    }

    // Hit iteration limit - something went wrong
    this.feasible = false;
    return iterations;
}

/**
 * Phase 1: Find an initial basic feasible solution.
 *
 * Pivots to eliminate negative RHS values (infeasible basic variables).
 * Uses max-quotient rule for fast convergence, with anti-cycling fallback
 * to Bland's rule if degenerate stalling is detected.
 *
 * @returns Number of pivot iterations performed.
 */
export function phase1(this: Tableau): number {
    // The fast loop picks the entering column by the dual ratio test, so it is
    // a genuine dual simplex only from a dual-feasible basis (the usual case
    // after branch-and-cut adds bound rows to an optimal tableau). From any
    // other basis it is a heuristic: usually quick, but it can wander, cycle,
    // or falsely report infeasibility. So on a cold start, run it from a
    // saved state and, if it fails, restore and use the primal phase 1.
    if (isDualFeasible(this)) {
        return phase1Fast.call(this, true);
    }
    const start = this.snapshot();
    const iterations = phase1Fast.call(this, false);
    if (iterations >= 0) {
        return iterations;
    }
    this.loadSnapshot(start);
    return phase1Robust.call(this);
}

/**
 * Fast phase 1 loop (most-negative row, dual ratio test column).
 *
 * @param robustFallback - On stall or an infeasibility verdict, finish with
 *   phase1Robust from the current basis (valid when the start was dual
 *   feasible). When false, return -1 instead so the caller can restore.
 * @returns Number of pivot iterations, or -1 if it failed without fallback.
 */
function phase1Fast(this: Tableau, robustFallback: boolean): number {
    const hasBounds = this.hasBounds;
    const debugCheckForCycles = this.model.checkForCycles;
    const cycleDetector = debugCheckForCycles ? new CycleDetector() : null;

    const matrix = this.matrix;
    const width = this.width;
    const rhsColumn = this.rhsColumn;
    const lastColumn = this.width - 1;
    const lastRow = this.height - 1;
    const precision = this.precision;
    const negPrecision = -precision;

    // Cache arrays for faster access in hot loops
    const unrestrictedVars = this.unrestrictedVars;
    const varIndexByRow = this.varIndexByRow;
    const varIndexByCol = this.varIndexByCol;

    // Anti-cycling: on degenerate problems, the max-quotient pivot rule
    // can oscillate, corrupting the matrix. We detect stalling early
    // (after SAVE_THRESHOLD iterations without RHS improvement) and save
    // the matrix state. If still stuck after maxQuotientLimit iterations,
    // we restore the clean matrix and switch to Bland's rule. The lazy
    // save avoids the copy cost on the vast majority of phase1 calls
    // that converge quickly.
    const SAVE_THRESHOLD = 10;
    const maxQuotientLimit = Math.max(lastRow, lastColumn);

    let iterations = 0;
    let useBland = false;
    let initialRHS = -Infinity;

    let savedMatrix: Float64Array | null = null;
    let savedVarIndexByRow: number[] | null = null;
    let savedVarIndexByCol: number[] | null = null;
    let savedRowByVarIndex: number[] | null = null;
    let savedColByVarIndex: number[] | null = null;
    let savedBounds: BoundState | null = null;

    while (true) {
        // Find leaving row (most negative RHS among restricted basic vars).
        // Unrestricted variables can validly have negative values, so rows
        // where the basic variable is unrestricted are not infeasible.
        let leavingRowIndex = 0;
        let rhsValue = negPrecision;
        let leavesAboveRange = false;
        for (let r = 1; r <= lastRow; r++) {
            if (unrestrictedVars[varIndexByRow[r]] === true) continue;
            const value = matrix[r * width + rhsColumn];
            if (value < rhsValue) {
                rhsValue = value;
                leavingRowIndex = r;
                leavesAboveRange = false;
            }
            if (hasBounds) {
                // A basic variable above its range is as infeasible as one below zero.
                const excess = rangeOf(this, varIndexByRow[r]) - value;
                if (excess < rhsValue) {
                    rhsValue = excess;
                    leavingRowIndex = r;
                    leavesAboveRange = true;
                }
            }
        }

        if (leavingRowIndex === 0) {
            this.feasible = true;
            return iterations;
        }
        if (leavesAboveRange) {
            // Complement the basic variable: the excess becomes a negative rhs.
            flipRowToUpper(this, leavingRowIndex);
        }

        // Detect non-convergence and apply anti-cycling.
        if (!useBland && iterations > 0 && rhsValue <= initialRHS) {
            if (iterations >= SAVE_THRESHOLD && savedMatrix === null) {
                // Stalling detected: save matrix for potential rollback
                savedMatrix = matrix.slice();
                savedVarIndexByRow = varIndexByRow.slice();
                savedVarIndexByCol = varIndexByCol.slice();
                savedRowByVarIndex = this.rowByVarIndex.slice();
                savedColByVarIndex = this.colByVarIndex.slice();
                savedBounds = captureBounds(this);
            }
            if (iterations >= maxQuotientLimit) {
                if (!robustFallback) {
                    return -1;
                }
                // Still stuck after generous budget: restore the pre-stall
                // matrix and finish with the primal-monotone phase 1, which
                // cannot cycle the way this dual-style loop can.
                if (savedMatrix) {
                    restoreBounds(this, savedBounds);
                    matrix.set(savedMatrix);
                    for (let i = 0; i < savedVarIndexByRow!.length; i++) {
                        varIndexByRow[i] = savedVarIndexByRow![i];
                    }
                    for (let i = 0; i < savedVarIndexByCol!.length; i++) {
                        varIndexByCol[i] = savedVarIndexByCol![i];
                    }
                    for (let i = 0; i < savedRowByVarIndex!.length; i++) {
                        this.rowByVarIndex[i] = savedRowByVarIndex![i];
                    }
                    for (let i = 0; i < savedColByVarIndex!.length; i++) {
                        this.colByVarIndex[i] = savedColByVarIndex![i];
                    }
                }
                return iterations + phase1Robust.call(this);
            }
        }
        if (iterations === 0) {
            initialRHS = rhsValue;
        }

        // Find entering column.
        // Prefer columns with negative coefficient in leaving row (these directly
        // fix the infeasibility by making RHS positive after pivot).
        // Only fall back to unrestricted variables with positive coefficient when
        // no negative coefficient column exists - this "swaps" the infeasibility
        // to an unrestricted variable (which is allowed to be negative).
        let enteringColumn = 0;
        const leavingRowOffset = leavingRowIndex * width;

        if (useBland) {
            // Bland's rule: pick the first eligible column (smallest index).
            // First pass: negative coefficients only (directly fix infeasibility)
            for (let c = 1; c <= lastColumn; c++) {
                const coefficient = matrix[leavingRowOffset + c];
                if (coefficient < negPrecision) {
                    if (hasBounds && rangeOf(this, varIndexByCol[c]) <= precision) continue;
                    enteringColumn = c;
                    break;
                }
            }
            // Fallback: unrestricted with non-zero coefficient (swap infeasibility)
            if (enteringColumn === 0) {
                for (let c = 1; c <= lastColumn; c++) {
                    const coefficient = matrix[leavingRowOffset + c];
                    if (
                        unrestrictedVars[varIndexByCol[c]] === true &&
                        (coefficient < negPrecision || coefficient > precision)
                    ) {
                        enteringColumn = c;
                        break;
                    }
                }
            }
        } else {
            // Max-quotient rule: faster in practice but can oscillate on
            // degenerate problems.
            // First pass: negative coefficients only
            let maxQuotient = -Infinity;
            for (let c = 1; c <= lastColumn; c++) {
                const coefficient = matrix[leavingRowOffset + c];
                if (coefficient < negPrecision) {
                    if (hasBounds && rangeOf(this, varIndexByCol[c]) <= precision) continue;
                    const quotient = -matrix[c] / coefficient;
                    if (maxQuotient < quotient) {
                        maxQuotient = quotient;
                        enteringColumn = c;
                    }
                }
            }
            // Fallback: unrestricted with non-zero coefficient
            if (enteringColumn === 0) {
                for (let c = 1; c <= lastColumn; c++) {
                    const coefficient = matrix[leavingRowOffset + c];
                    if (
                        unrestrictedVars[varIndexByCol[c]] === true &&
                        (coefficient < negPrecision || coefficient > precision)
                    ) {
                        enteringColumn = c;
                        break;
                    }
                }
            }
        }

        if (enteringColumn === 0) {
            // The row looks unfixable, but entries within precision of zero
            // were ignored. Confirm with the primal phase 1 before declaring
            // the problem infeasible.
            if (!robustFallback) {
                return -1;
            }
            return iterations + phase1Robust.call(this);
        }

        if (cycleDetector) {
            const cycleData = cycleDetector.add(
                varIndexByRow[leavingRowIndex],
                varIndexByCol[enteringColumn]
            );
            if (cycleData.length > 0) {
                this.model.messages.push("Cycle in phase 1");
                this.model.messages.push("Start :" + cycleData[0]);
                this.model.messages.push("Length :" + cycleData[1]);

                this.feasible = false;
                return iterations;
            }
        }

        this.pivot(leavingRowIndex, enteringColumn);
        iterations += 1;
    }
}

/**
 * Check whether the current basis is dual feasible: no nonbasic column has a
 * reduced cost that phase 2 would treat as improving.
 */
function isDualFeasible(tableau: Tableau): boolean {
    const matrix = tableau.matrix;
    const lastColumn = tableau.width - 1;
    const precision = tableau.precision;
    const unrestrictedVars = tableau.unrestrictedVars;
    const varIndexByCol = tableau.varIndexByCol;
    const hasBounds = tableau.hasBounds;
    for (let c = 1; c <= lastColumn; c++) {
        const reducedCost = matrix[c];
        if (hasBounds && rangeOf(tableau, varIndexByCol[c]) <= precision) continue;
        if (reducedCost > precision) return false;
        if (reducedCost < -precision && unrestrictedVars[varIndexByCol[c]] === true) {
            return false;
        }
    }
    return true;
}

/**
 * Robust phase 1: minimize the sum of primal infeasibilities.
 *
 * Textbook composite phase 1 (Chvátal ch. 8; Maros ch. 9). Unlike the fast
 * dual-style loop in `phase1`, every pivot is primal-monotone: rows that are
 * feasible stay feasible (ratio test over them) and infeasible rows only
 * move toward zero, so the total infeasibility never increases. A
 * dual-feasible basis is not required, which makes this safe as a fallback
 * from any basis. Bland's rule is used on degenerate stalls so it terminates.
 *
 * Infeasibility is only declared when no column can reduce the
 * infeasibility sum, which is a proof (Farkas) rather than a heuristic.
 *
 * Convention: basic value x_B(r) = rhs(r) - a(r,c) * t when the nonbasic in
 * column c moves by t.
 *
 * @returns Number of pivot iterations performed.
 */
export function phase1Robust(this: Tableau): number {
    const matrix = this.matrix;
    const width = this.width;
    const rhsColumn = this.rhsColumn;
    const lastColumn = width - 1;
    const lastRow = this.height - 1;
    const precision = this.precision;
    const unrestrictedVars = this.unrestrictedVars;
    const varIndexByRow = this.varIndexByRow;
    const varIndexByCol = this.varIndexByCol;

    // Pivot elements smaller than this are rejected to avoid blowing up the tableau.
    const PIVOT_TOL = 1e-9;
    const STALL_LIMIT = 50;
    const maxIterations = 50 * (lastRow + lastColumn) + 1000;

    const gradient = new Float64Array(width);
    const infeasibleRows = new Int32Array(lastRow + 1);
    const breakpointRows = new Int32Array(lastRow + 1);
    const breakpointRatios = new Float64Array(lastRow + 1);
    const order: number[] = [];

    let iterations = 0;
    let bestInfeasibility = Infinity;
    let stalled = 0;

    const hasBounds = this.hasBounds;

    while (iterations < maxIterations) {
        let nInfeasible = 0;
        let infeasibility = 0;
        for (let r = 1; r <= lastRow; r++) {
            if (unrestrictedVars[varIndexByRow[r]] === true) continue;
            if (
                hasBounds &&
                matrix[r * width + rhsColumn] > rangeOf(this, varIndexByRow[r]) + precision
            ) {
                // Above its range: complement so the excess reads as a negative rhs.
                flipRowToUpper(this, r);
            }
            const value = matrix[r * width + rhsColumn];
            if (value < -precision) {
                infeasibleRows[nInfeasible++] = r;
                infeasibility -= value;
            }
        }
        if (nInfeasible === 0) {
            this.feasible = true;
            return iterations;
        }

        if (infeasibility < bestInfeasibility * (1 - 1e-12)) {
            bestInfeasibility = infeasibility;
            stalled = 0;
        } else {
            stalled++;
        }
        const useBland = stalled >= STALL_LIMIT;

        // gradient[c] = d(sum of infeasible x_B)/dt for column c moving up
        gradient.fill(0);
        for (let i = 0; i < nInfeasible; i++) {
            const rowOffset = infeasibleRows[i] * width;
            for (let c = 1; c <= lastColumn; c++) {
                gradient[c] -= matrix[rowOffset + c];
            }
        }

        // Pricing: restricted nonbasics may only increase; unrestricted may move either way.
        let enteringColumn = 0;
        let direction = 1;
        let best = precision;
        for (let c = 1; c <= lastColumn; c++) {
            if (c === rhsColumn) continue;
            const g = gradient[c];
            let score = g;
            let dir = 1;
            if (hasBounds && rangeOf(this, varIndexByCol[c]) <= precision) continue;
            if (g < 0 && unrestrictedVars[varIndexByCol[c]] === true) {
                score = -g;
                dir = -1;
            }
            if (score > best) {
                enteringColumn = c;
                direction = dir;
                if (useBland) break;
                best = score;
            }
        }

        if (enteringColumn === 0) {
            this.feasible = false;
            return iterations;
        }

        // Ratio test. Feasible restricted rows are hard blocks (they must not go
        // negative). Infeasible rows moving up are breakpoints: once one reaches
        // zero it stops contributing to the slope. The long step (Wolfe's
        // composite rule; Maros ch. 9) passes breakpoints while the slope stays
        // positive, so one pivot can repair many rows. On degenerate stalls,
        // fall back to the shortest step with Bland's tie-break.
        let leavingRow = 0;
        let hardRatio = Infinity;
        let hardRow = 0;
        let hardPivot = 0;
        let nBreakpoints = 0;
        let upperRatio = Infinity;
        let upperRow = 0;
        for (let r = 1; r <= lastRow; r++) {
            if (unrestrictedVars[varIndexByRow[r]] === true) continue;
            const rowOffset = r * width;
            const a = direction * matrix[rowOffset + enteringColumn];
            const value = matrix[rowOffset + rhsColumn];
            if (hasBounds && a < -PIVOT_TOL) {
                // Rising rows stop at their range (feasible or not).
                const range = rangeOf(this, varIndexByRow[r]);
                if (range !== Infinity) {
                    const ratio = Math.max(0, range - value) / -a;
                    if (ratio < upperRatio) {
                        upperRatio = ratio;
                        upperRow = r;
                    }
                }
            }
            if (value >= -precision) {
                if (a <= PIVOT_TOL) continue;
                const ratio = (value > 0 ? value : 0) / a;
                if (
                    ratio < hardRatio - 1e-12 ||
                    (ratio <= hardRatio + 1e-12 &&
                        (useBland ? varIndexByRow[r] < varIndexByRow[hardRow] : a > hardPivot))
                ) {
                    hardRatio = ratio;
                    hardRow = r;
                    hardPivot = a;
                }
            } else if (a < -PIVOT_TOL) {
                breakpointRows[nBreakpoints] = r;
                breakpointRatios[nBreakpoints] = value / a;
                nBreakpoints++;
            }
        }

        if (hasBounds) {
            // Conservative step with bounds over every kind of block: rows
            // falling to zero (feasible a > 0, or infeasible a < 0 rising to
            // zero), rows rising to their range, and the entering variable's
            // own range (a bound flip). Harris two-pass so degenerate ties
            // never pick a tiny pivot; Bland's tie-break once stalled.
            const enteringRange =
                direction === 1 ? rangeOf(this, varIndexByCol[enteringColumn]) : Infinity;
            let maxStep = enteringRange;
            for (let r = 1; r <= lastRow; r++) {
                const rowVar = varIndexByRow[r];
                if (unrestrictedVars[rowVar] === true) continue;
                const rowOffset = r * width;
                const a = direction * matrix[rowOffset + enteringColumn];
                const value = matrix[rowOffset + rhsColumn];
                if (a > PIVOT_TOL && value >= -precision) {
                    maxStep = Math.min(maxStep, (Math.max(value, 0) + precision) / a);
                } else if (a < -PIVOT_TOL) {
                    if (value < -precision) maxStep = Math.min(maxStep, (value - precision) / a);
                    const range = rangeOf(this, rowVar);
                    if (range !== Infinity) {
                        maxStep = Math.min(maxStep, (Math.max(range - value, 0) + precision) / -a);
                    }
                }
            }
            let bestPivot = 0;
            let bestRatio = Infinity;
            let toUpper = false;
            leavingRow = 0;
            for (let r = 1; r <= lastRow; r++) {
                const rowVar = varIndexByRow[r];
                if (unrestrictedVars[rowVar] === true) continue;
                const rowOffset = r * width;
                const a = direction * matrix[rowOffset + enteringColumn];
                const value = matrix[rowOffset + rhsColumn];
                const consider = (ratio: number, size: number, upper: boolean): void => {
                    const take = useBland
                        ? ratio < bestRatio - 1e-12 ||
                          (ratio <= bestRatio + 1e-12 &&
                              (leavingRow === 0 || rowVar < varIndexByRow[leavingRow]))
                        : ratio <= maxStep && size > bestPivot;
                    if (take) {
                        bestRatio = ratio;
                        bestPivot = size;
                        leavingRow = r;
                        toUpper = upper;
                    }
                };
                if (a > PIVOT_TOL && value >= -precision) {
                    consider(Math.max(value, 0) / a, a, false);
                } else if (a < -PIVOT_TOL) {
                    if (value < -precision) consider(value / a, -a, false);
                    const range = rangeOf(this, rowVar);
                    if (range !== Infinity && value >= -precision) {
                        consider(Math.max(range - value, 0) / -a, -a, true);
                    }
                }
            }
            if (enteringRange < (leavingRow === 0 ? Infinity : bestRatio)) {
                flipColumnToUpper(this, enteringColumn);
                iterations++;
                continue;
            }
            if (toUpper && leavingRow !== 0) {
                flipRowToUpper(this, leavingRow);
            }
        } else if (useBland) {
            let minRatio = hardRatio;
            leavingRow = hardRow;
            for (let i = 0; i < nBreakpoints; i++) {
                const ratio = breakpointRatios[i];
                const r = breakpointRows[i];
                if (
                    ratio < minRatio - 1e-12 ||
                    (ratio <= minRatio + 1e-12 && varIndexByRow[r] < varIndexByRow[leavingRow])
                ) {
                    minRatio = ratio;
                    leavingRow = r;
                }
            }
        } else {
            // Walk breakpoints before the hard block in increasing order.
            order.length = 0;
            for (let i = 0; i < nBreakpoints; i++) {
                if (breakpointRatios[i] < hardRatio) order.push(i);
            }
            order.sort((i, j) => breakpointRatios[i] - breakpointRatios[j]);
            let slope = best;
            for (let k = 0; k < order.length; k++) {
                const r = breakpointRows[order[k]];
                leavingRow = r;
                slope += direction * matrix[r * width + enteringColumn];
                if (slope <= precision) break;
            }
            if (hardRow !== 0 && (order.length === 0 || slope > precision)) {
                leavingRow = hardRow;
            }
        }

        if (leavingRow === 0) {
            // Gradient was driven by entries below PIVOT_TOL: no safe pivot.
            this.feasible = false;
            return iterations;
        }

        this.pivot(leavingRow, enteringColumn);
        iterations++;
    }

    this.feasible = false;
    return iterations;
}

/**
 * Phase 2: Optimize the objective function.
 *
 * Pivots to improve the objective by selecting entering variables with
 * positive reduced costs. Uses partial pricing on large problems (batched
 * column scanning) and falls back to Bland's rule on degenerate cycling.
 *
 * Handles hierarchical (multi-priority) objectives by checking optional
 * objective reduced costs when the primary objective is at optimality.
 *
 * @returns Number of pivot iterations performed.
 */
export function phase2(this: Tableau): number {
    const hasBounds = this.hasBounds;
    const debugCheckForCycles = this.model.checkForCycles;
    const cycleDetector = debugCheckForCycles ? new CycleDetector() : null;

    const matrix = this.matrix;
    const width = this.width;
    const rhsColumn = this.rhsColumn;
    const lastColumn = this.width - 1;
    const lastRow = this.height - 1;

    const precision = this.precision;
    const negPrecision = -precision;
    const nOptionalObjectives = this.optionalObjectives.length;
    let optionalCostsColumns: number[] | null = null;

    // Cache arrays for faster access in hot loops
    const unrestrictedVars = this.unrestrictedVars;
    const varIndexByCol = this.varIndexByCol;
    const varIndexByRow = this.varIndexByRow;

    // Note: costRowIndex is always 0, so we access matrix[c] directly

    let iterations = 0;
    let reducedCost: number;
    let unrestricted: boolean;

    // Anti-cycling for phase 2: if the objective stalls (no meaningful
    // improvement over several hundred iterations), the simplex is
    // cycling through degenerate vertices. Switch to Bland's rule which
    // guarantees termination in exact arithmetic. In floating-point,
    // even Bland's can cycle indefinitely, so we also impose a limit:
    // if Bland's runs for lastRow iterations without improving the
    // objective, we accept the current solution as optimal.
    const PHASE2_WINDOW = 100;
    const PHASE2_STALE_LIMIT = 5; // consecutive stale windows before switching
    let useBland = false;
    let windowStartObj = matrix[rhsColumn];
    let staleWindows = 0;
    let blandStartIter = 0;
    let blandStartObj = 0;
    const blandBudget = Math.max(1000, 20 * (lastRow + lastColumn));

    // Partial pricing setup
    // Batch size: use configured value or auto-compute (sqrt of columns, min 100, max 500)
    const nColumns = lastColumn;
    const batchSize =
        this.pricingBatchSize > 0
            ? this.pricingBatchSize
            : Math.min(500, Math.max(100, Math.floor(Math.sqrt(nColumns))));

    // For small problems, just scan everything (no benefit from partial pricing)
    const usePartialPricing = nColumns > batchSize * 2;

    while (true) {
        if (nOptionalObjectives > 0) {
            optionalCostsColumns = [];
        }

        // Detect degenerate cycling: check every WINDOW iterations
        // whether the objective has made meaningful progress.
        if (!useBland && iterations > 0 && iterations % PHASE2_WINDOW === 0) {
            const currentObj = matrix[rhsColumn];
            const delta = Math.abs(currentObj - windowStartObj);
            const scale = Math.max(1, Math.abs(windowStartObj));
            if (delta / scale < 1e-10) {
                staleWindows++;
                if (staleWindows >= PHASE2_STALE_LIMIT) {
                    useBland = true;
                    blandStartIter = iterations;
                    blandStartObj = currentObj;
                }
            } else {
                staleWindows = 0;
            }
            windowStartObj = currentObj;
        }

        // Bland's termination: in floating-point arithmetic, Bland's rule
        // can cycle through degenerate bases indefinitely. If it hasn't
        // improved the objective after a generous budget, accept the current
        // solution (reduced costs are within floating-point noise of zero).
        // With Bland's rule on both entering and leaving choices it should
        // reach optimality or detect unboundedness well within the budget;
        // a short budget (it used to be lastRow pivots) gave up on
        // degenerate cycles and reported unbounded problems as optimal.
        if (useBland && iterations - blandStartIter > blandBudget) {
            const currentObj = matrix[rhsColumn];
            const delta = Math.abs(currentObj - blandStartObj);
            const scale = Math.max(1, Math.abs(blandStartObj));
            if (delta / scale < 1e-10) {
                this.setEvaluation();
                this.simplexIters += 1;
                return iterations;
            }
            // Objective did improve; reset the counter
            blandStartIter = iterations;
            blandStartObj = currentObj;
        }

        let enteringColumn = 0;
        let enteringValue = precision;
        let isReducedCostNegative = false;

        if (useBland) {
            // Bland's rule: pick first eligible column (smallest index)
            for (let c = 1; c <= lastColumn; c++) {
                reducedCost = matrix[c];
                if (hasBounds && rangeOf(this, varIndexByCol[c]) <= precision) continue;
                unrestricted = unrestrictedVars[varIndexByCol[c]] === true;

                if (unrestricted && reducedCost < 0) {
                    enteringColumn = c;
                    enteringValue = -reducedCost;
                    isReducedCostNegative = true;
                    break;
                }

                if (reducedCost > precision) {
                    enteringColumn = c;
                    enteringValue = reducedCost;
                    isReducedCostNegative = false;
                    break;
                }
            }
        } else if (usePartialPricing) {
            // Partial pricing: scan columns in batches
            const startBatch = this.pricingBatchStart;
            let batchesScanned = 0;
            const totalBatches = Math.ceil(nColumns / batchSize);

            // Scan batches until we find an improving column or exhaust all batches
            while (enteringColumn === 0 && batchesScanned < totalBatches) {
                const batchStart = this.pricingBatchStart;
                const batchEnd = Math.min(batchStart + batchSize - 1, lastColumn);

                for (let c = batchStart; c <= batchEnd; c++) {
                    reducedCost = matrix[c]; // costRowOffset is 0
                    if (hasBounds && rangeOf(this, varIndexByCol[c]) <= precision) continue;
                    if (hasBounds && rangeOf(this, varIndexByCol[c]) <= precision) continue;
                    unrestricted = unrestrictedVars[varIndexByCol[c]] === true;

                    if (
                        nOptionalObjectives > 0 &&
                        negPrecision < reducedCost &&
                        reducedCost < precision
                    ) {
                        optionalCostsColumns?.push(c);
                        continue;
                    }

                    if (unrestricted && reducedCost < 0) {
                        if (-reducedCost > enteringValue) {
                            enteringValue = -reducedCost;
                            enteringColumn = c;
                            isReducedCostNegative = true;
                        }
                        continue;
                    }

                    if (reducedCost > enteringValue) {
                        enteringValue = reducedCost;
                        enteringColumn = c;
                        isReducedCostNegative = false;
                    }
                }

                // Move to next batch (wrap around)
                this.pricingBatchStart = batchEnd >= lastColumn ? 1 : batchEnd + 1;
                batchesScanned++;
            }

            // Reset batch start if we found an improving column
            if (enteringColumn !== 0) {
                this.pricingBatchStart = startBatch;
            }
        } else {
            // Full pricing for small problems
            for (let c = 1; c <= lastColumn; c++) {
                reducedCost = matrix[c]; // costRowOffset is 0
                unrestricted = unrestrictedVars[varIndexByCol[c]] === true;

                if (
                    nOptionalObjectives > 0 &&
                    negPrecision < reducedCost &&
                    reducedCost < precision
                ) {
                    optionalCostsColumns?.push(c);
                    continue;
                }

                if (unrestricted && reducedCost < 0) {
                    if (-reducedCost > enteringValue) {
                        enteringValue = -reducedCost;
                        enteringColumn = c;
                        isReducedCostNegative = true;
                    }
                    continue;
                }

                if (reducedCost > enteringValue) {
                    enteringValue = reducedCost;
                    enteringColumn = c;
                    isReducedCostNegative = false;
                }
            }
        }

        if (nOptionalObjectives > 0) {
            let o = 0;
            while (
                enteringColumn === 0 &&
                optionalCostsColumns &&
                optionalCostsColumns.length > 0 &&
                o < nOptionalObjectives
            ) {
                const optionalCostsColumns2: number[] = [];
                const reducedCosts = this.optionalObjectives[o].reducedCosts;

                enteringValue = precision;

                for (let i = 0; i < optionalCostsColumns.length; i++) {
                    const c = optionalCostsColumns[i];

                    reducedCost = reducedCosts[c];
                    unrestricted = unrestrictedVars[varIndexByCol[c]] === true;

                    if (negPrecision < reducedCost && reducedCost < precision) {
                        optionalCostsColumns2.push(c);
                        continue;
                    }

                    if (unrestricted && reducedCost < 0) {
                        if (-reducedCost > enteringValue) {
                            enteringValue = -reducedCost;
                            enteringColumn = c;
                            isReducedCostNegative = true;
                        }
                        continue;
                    }

                    if (reducedCost > enteringValue) {
                        enteringValue = reducedCost;
                        enteringColumn = c;
                        isReducedCostNegative = false;
                    }
                }
                optionalCostsColumns = optionalCostsColumns2;
                o += 1;
            }
        }

        if (enteringColumn === 0) {
            this.setEvaluation();
            this.simplexIters += 1;
            return iterations;
        }

        // Harris two-pass ratio test (Harris 1973; Koberstein 2005 §6.2).
        // Basic value x_B(r) = rhs(r) - a(r) * t, where a is the entering
        // column oriented along the direction of motion. Only restricted rows
        // with a > 0 block; unrestricted basic variables may go negative.
        //   Pass 1: largest step if every blocking row may dip to -FEAS_TOL.
        //   Pass 2: among rows reaching zero within that step, take the
        //           largest |a| for a stable pivot.
        // Every blocking row counts, however small its ratio: skipping tiny
        // ratios overshoots and drives rows negative.
        // With column bounds, a row whose basic variable rises toward its
        // range also blocks (distance range - rhs, entry -a); it then leaves
        // at its upper bound by complementing it before the pivot.
        let leavingRow = 0;
        let leavingToUpper = false;
        let minQuotient = Infinity;
        let maxStep = Infinity;
        for (let r = 1; r <= lastRow; r++) {
            const rowVar = varIndexByRow[r];
            if (unrestrictedVars[rowVar] === true) continue;
            const rowOffset = r * width;
            const colValue = matrix[rowOffset + enteringColumn];
            const a = isReducedCostNegative ? -colValue : colValue;
            let step: number;
            // Distances are clamped at zero: a row already slightly past its
            // bound (beyond FEAS_TOL) would otherwise make the step negative,
            // leave no row eligible in pass 2, and fake an unbounded ray.
            if (a > HARRIS_PIVOT_TOL) {
                step = (Math.max(matrix[rowOffset + rhsColumn], 0) + HARRIS_FEAS_TOL) / a;
            } else if (hasBounds && a < -HARRIS_PIVOT_TOL) {
                const range = rangeOf(this, rowVar);
                if (range === Infinity) continue;
                step = (Math.max(range - matrix[rowOffset + rhsColumn], 0) + HARRIS_FEAS_TOL) / -a;
            } else {
                continue;
            }
            if (step < maxStep) maxStep = step;
        }
        if (maxStep !== Infinity) {
            // Pass 2. In Bland mode anti-cycling needs Bland's rule on the
            // leaving side too (exact minimum ratio, smallest basic index);
            // Harris's largest-pivot choice can cycle on degenerate vertices.
            let bestPivot = 0;
            for (let r = 1; r <= lastRow; r++) {
                const rowVar = varIndexByRow[r];
                if (unrestrictedVars[rowVar] === true) continue;
                const rowOffset = r * width;
                const colValue = matrix[rowOffset + enteringColumn];
                const a = isReducedCostNegative ? -colValue : colValue;
                let distance: number;
                let pivotSize: number;
                let toUpper = false;
                if (a > HARRIS_PIVOT_TOL) {
                    distance = matrix[rowOffset + rhsColumn];
                    pivotSize = a;
                } else if (hasBounds && a < -HARRIS_PIVOT_TOL) {
                    const range = rangeOf(this, rowVar);
                    if (range === Infinity) continue;
                    distance = range - matrix[rowOffset + rhsColumn];
                    pivotSize = -a;
                    toUpper = true;
                } else {
                    continue;
                }
                const ratio = (distance > 0 ? distance : 0) / pivotSize;
                if (useBland) {
                    if (
                        ratio < minQuotient ||
                        (ratio === minQuotient && rowVar < varIndexByRow[leavingRow])
                    ) {
                        minQuotient = ratio;
                        leavingRow = r;
                        leavingToUpper = toUpper;
                    }
                } else if (ratio <= maxStep && pivotSize > bestPivot) {
                    bestPivot = pivotSize;
                    leavingRow = r;
                    minQuotient = ratio;
                    leavingToUpper = toUpper;
                }
            }
        }

        // Bounded entering variable: if it reaches its own upper bound first,
        // complement it in place (a bound flip) instead of pivoting.
        if (hasBounds && !isReducedCostNegative) {
            const enteringRange = rangeOf(this, varIndexByCol[enteringColumn]);
            if (enteringRange < minQuotient) {
                flipColumnToUpper(this, enteringColumn);
                iterations += 1;
                continue;
            }
        }

        if (leavingRow !== 0) {
            if (leavingToUpper) {
                flipRowToUpper(this, leavingRow);
            }
            // The chosen row may sit slightly outside its bound (within
            // FEAS_TOL); snap it to zero so the step is never negative.
            const leavingRhs = leavingRow * width + rhsColumn;
            if (matrix[leavingRhs] < 0) matrix[leavingRhs] = 0;
        }

        if (minQuotient === Infinity) {
            this.evaluation = -Infinity;
            this.bounded = false;
            this.unboundedVarIndex = varIndexByCol[enteringColumn];
            return iterations;
        }

        if (cycleDetector) {
            const cycleData = cycleDetector.add(
                varIndexByRow[leavingRow],
                varIndexByCol[enteringColumn]
            );
            if (cycleData.length > 0) {
                this.model.messages.push("Cycle in phase 2");
                this.model.messages.push("Start :" + cycleData[0]);
                this.model.messages.push("Length :" + cycleData[1]);

                this.feasible = false;
                return iterations;
            }
        }

        this.pivot(leavingRow, enteringColumn);
        iterations += 1;
    }
}

/** Harris ratio test: smallest entering-column entry accepted as a pivot. */
const HARRIS_PIVOT_TOL = 1e-9;
/** Harris ratio test: how far a basic variable may dip below zero in pass 1. */
const HARRIS_FEAS_TOL = 1e-9;

// Pre-allocated typed arrays for pivot optimization (better cache locality)
let nonZeroColumns = new Int32Array(1024);
let pivotRowCache = new Float64Array(1024);

/**
 * Perform a single simplex pivot operation.
 *
 * Swaps the entering variable (non-basic, in column) with the leaving variable
 * (basic, in row). Updates the entire matrix using cached pivot row values
 * for better cache locality. Also updates optional objective reduced costs.
 *
 * @param pivotRowIndex - Row of the leaving variable.
 * @param pivotColumnIndex - Column of the entering variable.
 */
export function pivot(this: Tableau, pivotRowIndex: number, pivotColumnIndex: number): void {
    const matrix = this.matrix;
    const width = this.width;

    // Ensure work arrays are large enough
    if (width > nonZeroColumns.length) {
        nonZeroColumns = new Int32Array(width * 2);
        pivotRowCache = new Float64Array(width * 2);
    }

    const pivotRowOffset = pivotRowIndex * width;
    const quotient = matrix[pivotRowOffset + pivotColumnIndex];
    const invQuotient = 1 / quotient;

    const height = this.height;

    const leavingBasicIndex = this.varIndexByRow[pivotRowIndex];
    const enteringBasicIndex = this.varIndexByCol[pivotColumnIndex];

    this.varIndexByRow[pivotRowIndex] = enteringBasicIndex;
    this.varIndexByCol[pivotColumnIndex] = leavingBasicIndex;

    this.rowByVarIndex[enteringBasicIndex] = pivotRowIndex;
    this.rowByVarIndex[leavingBasicIndex] = -1;

    this.colByVarIndex[enteringBasicIndex] = -1;
    this.colByVarIndex[leavingBasicIndex] = pivotColumnIndex;

    // Normalize pivot row, track non-zero columns, and cache values for locality
    let nNonZeroColumns = 0;
    for (let c = 0; c < width; c++) {
        const idx = pivotRowOffset + c;
        const val = matrix[idx];
        if (!(val >= -1e-16 && val <= 1e-16)) {
            const normalized = val / quotient;
            matrix[idx] = normalized;
            nonZeroColumns[nNonZeroColumns] = c;
            pivotRowCache[nNonZeroColumns] = normalized;
            nNonZeroColumns++;
        } else {
            matrix[idx] = 0;
        }
    }
    matrix[pivotRowOffset + pivotColumnIndex] = invQuotient;

    // Update all other rows using cached pivot row values
    for (let r = 0; r < height; r++) {
        if (r !== pivotRowIndex) {
            const rowOffset = r * width;
            const pivotColVal = matrix[rowOffset + pivotColumnIndex];
            if (!(pivotColVal >= -1e-16 && pivotColVal <= 1e-16)) {
                const coefficient = pivotColVal;

                if (!(coefficient >= -1e-16 && coefficient <= 1e-16)) {
                    // Use cached pivot row values for better cache locality
                    for (let i = 0; i < nNonZeroColumns; i++) {
                        const c = nonZeroColumns[i];
                        const v0 = pivotRowCache[i];
                        // Inner zero check is critical for numerical stability
                        if (!(v0 >= -1e-16 && v0 <= 1e-16)) {
                            matrix[rowOffset + c] -= coefficient * v0;
                        } else if (v0 !== 0) {
                            // Clean up near-zero values in pivot row
                            matrix[pivotRowOffset + c] = 0;
                        }
                    }

                    matrix[rowOffset + pivotColumnIndex] = -coefficient / quotient;
                } else if (coefficient !== 0) {
                    matrix[rowOffset + pivotColumnIndex] = 0;
                }
            }
        }
    }

    // Update optional objectives using cached pivot row values
    const optionalObjectives = this.optionalObjectives;
    const nOptionalObjectives = optionalObjectives.length;
    if (nOptionalObjectives > 0) {
        for (let o = 0; o < nOptionalObjectives; o++) {
            const reducedCosts = optionalObjectives[o].reducedCosts;
            const coefficient = reducedCosts[pivotColumnIndex];
            if (coefficient !== 0) {
                for (let i = 0; i < nNonZeroColumns; i++) {
                    const c = nonZeroColumns[i];
                    reducedCosts[c] -= coefficient * pivotRowCache[i];
                }
                reducedCosts[pivotColumnIndex] = -coefficient * invQuotient;
            }
        }
    }
}

/**
 * Legacy O(n^2) cycle detection by brute-force pair comparison.
 * Superseded by CycleDetector but retained for API compatibility.
 *
 * @param varIndexes - Array of [leaving, entering] pairs from pivot history.
 * @returns [startIndex, cycleLength] if cycle found, empty array otherwise.
 */
export function checkForCycles(this: Tableau, varIndexes: Array<[number, number]>): number[] {
    for (let e1 = 0; e1 < varIndexes.length - 1; e1++) {
        for (let e2 = e1 + 1; e2 < varIndexes.length; e2++) {
            const elt1 = varIndexes[e1];
            const elt2 = varIndexes[e2];
            if (elt1[0] === elt2[0] && elt1[1] === elt2[1]) {
                if (e2 - e1 > varIndexes.length - e2) {
                    break;
                }
                let cycleFound = true;
                for (let i = 1; i < e2 - e1; i++) {
                    const tmp1 = varIndexes[e1 + i];
                    const tmp2 = varIndexes[e2 + i];
                    if (tmp1[0] !== tmp2[0] || tmp1[1] !== tmp2[1]) {
                        cycleFound = false;
                        break;
                    }
                }
                if (cycleFound) {
                    return [e1, e2 - e1];
                }
            }
        }
    }
    return [];
}
