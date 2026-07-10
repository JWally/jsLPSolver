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

    while (true) {
        // Find leaving row (most negative RHS among restricted basic vars).
        // Unrestricted variables can validly have negative values, so rows
        // where the basic variable is unrestricted are not infeasible.
        let leavingRowIndex = 0;
        let rhsValue = negPrecision;
        for (let r = 1; r <= lastRow; r++) {
            if (unrestrictedVars[varIndexByRow[r]] === true) continue;
            const value = matrix[r * width + rhsColumn];
            if (value < rhsValue) {
                rhsValue = value;
                leavingRowIndex = r;
            }
        }

        if (leavingRowIndex === 0) {
            this.feasible = true;
            return iterations;
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
            }
            if (iterations >= maxQuotientLimit) {
                // Still stuck after generous budget: restore and switch
                useBland = true;
                if (savedMatrix) {
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
                    iterations = 0;
                    continue;
                }
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
            this.feasible = false;
            return iterations;
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
        // improved the objective after lastRow pivots, accept the current
        // solution (reduced costs are within floating-point noise of zero).
        if (useBland && iterations - blandStartIter > lastRow) {
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

        let leavingRow = 0;
        let minQuotient = Infinity;

        for (let r = 1; r <= lastRow; r++) {
            const rowOffset = r * width;
            const rhsValue = matrix[rowOffset + rhsColumn];
            const colValue = matrix[rowOffset + enteringColumn];

            if (negPrecision < colValue && colValue < precision) {
                continue;
            }

            if (colValue > 0 && precision > rhsValue && rhsValue > negPrecision) {
                minQuotient = 0;
                leavingRow = r;
                break;
            }

            const quotient = isReducedCostNegative ? -rhsValue / colValue : rhsValue / colValue;
            if (quotient > precision && minQuotient > quotient) {
                minQuotient = quotient;
                leavingRow = r;
            }
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
            if (c !== pivotColumnIndex) {
                nonZeroColumns[nNonZeroColumns] = c;
                pivotRowCache[nNonZeroColumns] = normalized;
                nNonZeroColumns++;
            }
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

                // Use cached pivot row values for better cache locality
                for (let i = 0; i < nNonZeroColumns; i++) {
                    const c = nonZeroColumns[i];
                    const v0 = pivotRowCache[i];
                    matrix[rowOffset + c] -= coefficient * v0;
                }

                matrix[rowOffset + pivotColumnIndex] = -coefficient / quotient;
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
