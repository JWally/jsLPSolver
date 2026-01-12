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
class CycleDetector {
    private pairs: Array<[number, number]> = [];
    private positions: Map<string, number[]> = new Map();

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

    let unrestricted: boolean;
    let iterations = 0;

    while (true) {
        // Find leaving row (most negative RHS)
        let leavingRowIndex = 0;
        let rhsValue = negPrecision;
        for (let r = 1; r <= lastRow; r++) {
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

        // Find entering column
        let enteringColumn = 0;
        let maxQuotient = -Infinity;
        const leavingRowOffset = leavingRowIndex * width;
        for (let c = 1; c <= lastColumn; c++) {
            const coefficient = matrix[leavingRowOffset + c];

            unrestricted = unrestrictedVars[varIndexByCol[c]] === true;
            if (unrestricted || coefficient < negPrecision) {
                const quotient = -matrix[c] / coefficient; // costRowOffset is 0
                if (maxQuotient < quotient) {
                    maxQuotient = quotient;
                    enteringColumn = c;
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

    // Partial pricing setup
    // Batch size: use configured value or auto-compute (sqrt of columns, min 50, max 500)
    const nColumns = lastColumn;
    const batchSize =
        this.pricingBatchSize > 0
            ? this.pricingBatchSize
            : Math.min(500, Math.max(50, Math.floor(Math.sqrt(nColumns))));

    // For small problems, just scan everything (no benefit from partial pricing)
    const usePartialPricing = nColumns > batchSize * 2;

    while (true) {
        if (nOptionalObjectives > 0) {
            optionalCostsColumns = [];
        }

        let enteringColumn = 0;
        let enteringValue = precision;
        let isReducedCostNegative = false;

        if (usePartialPricing) {
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

// Pre-allocated typed arrays for pivot optimization (better cache performance)
let nonZeroColumns = new Int32Array(1024);
let pivotRowCache = new Float64Array(1024);

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
