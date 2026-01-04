/**
 * Sparse Simplex Implementation
 *
 * Optimized simplex algorithm that operates directly on SparseMatrix
 * for large, sparse LP problems.
 */

import type Tableau from "./tableau";
import { SparseMatrix } from "./sparse-matrix";

/**
 * Convert dense tableau to sparse and solve
 */
export function sparseSimplex(this: Tableau): Tableau {
    // Convert to sparse
    const sparse = SparseMatrix.fromDense(this.matrix, this.width, this.height, this.precision);

    this.bounded = true;

    // Run sparse phase 1
    const phase1Result = sparsePhase1.call(this, sparse);

    if (this.feasible === true) {
        // Run sparse phase 2
        sparsePhase2.call(this, sparse);
    }

    // Copy results back to dense matrix (needed for solution extraction)
    const dense = sparse.toDense();
    this.matrix.set(dense);

    return this;
}

/**
 * Sparse Phase 1: Find a basic feasible solution
 */
function sparsePhase1(this: Tableau, sparse: SparseMatrix): number {
    const debugCheckForCycles = this.model.checkForCycles;
    const varIndexesCycle: Array<[number, number]> = [];

    const rhsColumn = this.rhsColumn;
    const lastColumn = this.width - 1;
    const lastRow = this.height - 1;
    const precision = this.precision;

    let unrestricted: boolean;
    let iterations = 0;

    while (true) {
        // Find leaving row (most negative RHS)
        let leavingRowIndex = 0;
        let rhsValue = -precision;

        for (let r = 1; r <= lastRow; r++) {
            const value = sparse.get(r, rhsColumn);
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

        // Get leaving row as sparse
        const leavingRowData = sparse.getRow(leavingRowIndex);

        for (let i = 0; i < leavingRowData.length; i++) {
            const c = leavingRowData.indices[i];
            if (c === 0 || c === rhsColumn) continue;

            const coefficient = leavingRowData.values[i];
            unrestricted = this.unrestrictedVars[this.varIndexByCol[c]] === true;

            if (unrestricted || coefficient < -precision) {
                const costValue = sparse.get(0, c);
                const quotient = -costValue / coefficient;
                if (maxQuotient < quotient) {
                    maxQuotient = quotient;
                    enteringColumn = c;
                }
            }
        }

        // Also check columns with zero in leaving row but non-zero cost
        for (let c = 1; c <= lastColumn; c++) {
            if (c === rhsColumn) continue;
            const coefficient = sparse.get(leavingRowIndex, c);
            unrestricted = this.unrestrictedVars[this.varIndexByCol[c]] === true;

            if (unrestricted || coefficient < -precision) {
                const costValue = sparse.get(0, c);
                const quotient = -costValue / coefficient;
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

        if (debugCheckForCycles) {
            varIndexesCycle.push([this.varIndexByRow[leavingRowIndex], this.varIndexByCol[enteringColumn]]);
            const cycleData = this.checkForCycles(varIndexesCycle);
            if (cycleData.length > 0) {
                this.model.messages.push("Cycle in phase 1");
                this.feasible = false;
                return iterations;
            }
        }

        // Perform pivot
        sparsePivot.call(this, sparse, leavingRowIndex, enteringColumn);
        iterations += 1;
    }
}

/**
 * Sparse Phase 2: Optimize the objective
 */
function sparsePhase2(this: Tableau, sparse: SparseMatrix): number {
    const debugCheckForCycles = this.model.checkForCycles;
    const varIndexesCycle: Array<[number, number]> = [];

    const rhsColumn = this.rhsColumn;
    const lastColumn = this.width - 1;
    const lastRow = this.height - 1;
    const precision = this.precision;

    const nOptionalObjectives = this.optionalObjectives.length;

    let iterations = 0;
    let reducedCost: number;
    let unrestricted: boolean;

    // Partial pricing for sparse
    const batchSize = Math.min(500, Math.max(50, Math.floor(Math.sqrt(lastColumn))));
    let batchStart = 1;

    while (true) {
        const costRow = 0;

        let enteringColumn = 0;
        let enteringValue = precision;
        let isReducedCostNegative = false;

        // Partial pricing: scan columns in batches
        let batchesScanned = 0;
        const totalBatches = Math.ceil(lastColumn / batchSize);

        while (enteringColumn === 0 && batchesScanned < totalBatches) {
            const batchEnd = Math.min(batchStart + batchSize - 1, lastColumn);

            for (let c = batchStart; c <= batchEnd; c++) {
                if (c === rhsColumn) continue;

                reducedCost = sparse.get(costRow, c);
                unrestricted = this.unrestrictedVars[this.varIndexByCol[c]] === true;

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

            batchStart = batchEnd >= lastColumn ? 1 : batchEnd + 1;
            batchesScanned++;
        }

        if (enteringColumn === 0) {
            this.setEvaluation();
            this.simplexIters += 1;
            return iterations;
        }

        // Find leaving row using ratio test
        let leavingRow = 0;
        let minQuotient = Infinity;

        // Get entering column as sparse
        const enteringColData = sparse.getColumn(enteringColumn);

        for (let i = 0; i < enteringColData.length; i++) {
            const r = enteringColData.indices[i];
            if (r === 0) continue; // Skip cost row

            const colValue = enteringColData.values[i];
            if (colValue >= -precision && colValue <= precision) continue;

            const rhsValue = sparse.get(r, rhsColumn);

            if (colValue > 0 && precision > rhsValue && rhsValue > -precision) {
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
            this.unboundedVarIndex = this.varIndexByCol[enteringColumn];
            return iterations;
        }

        if (debugCheckForCycles) {
            varIndexesCycle.push([this.varIndexByRow[leavingRow], this.varIndexByCol[enteringColumn]]);
            const cycleData = this.checkForCycles(varIndexesCycle);
            if (cycleData.length > 0) {
                this.model.messages.push("Cycle in phase 2");
                this.feasible = false;
                return iterations;
            }
        }

        // Perform pivot
        sparsePivot.call(this, sparse, leavingRow, enteringColumn);
        iterations += 1;
    }
}

/**
 * Sparse pivot operation
 */
function sparsePivot(
    this: Tableau,
    sparse: SparseMatrix,
    pivotRowIndex: number,
    pivotColumnIndex: number
): void {
    // Update basis tracking
    const leavingBasicIndex = this.varIndexByRow[pivotRowIndex];
    const enteringBasicIndex = this.varIndexByCol[pivotColumnIndex];

    this.varIndexByRow[pivotRowIndex] = enteringBasicIndex;
    this.varIndexByCol[pivotColumnIndex] = leavingBasicIndex;

    this.rowByVarIndex[enteringBasicIndex] = pivotRowIndex;
    this.rowByVarIndex[leavingBasicIndex] = -1;

    this.colByVarIndex[enteringBasicIndex] = -1;
    this.colByVarIndex[leavingBasicIndex] = pivotColumnIndex;

    // Perform sparse pivot
    sparse.pivot(pivotRowIndex, pivotColumnIndex);

    // Handle optional objectives (these are stored separately, not in sparse matrix)
    const optionalObjectives = this.optionalObjectives;
    const nOptionalObjectives = optionalObjectives.length;

    if (nOptionalObjectives > 0) {
        const pivotVal = sparse.get(pivotRowIndex, pivotColumnIndex);
        const pivotRowData = sparse.getRow(pivotRowIndex);

        for (let o = 0; o < nOptionalObjectives; o++) {
            const reducedCosts = optionalObjectives[o].reducedCosts;
            const coefficient = reducedCosts[pivotColumnIndex];

            if (coefficient !== 0) {
                for (let i = 0; i < pivotRowData.length; i++) {
                    const c = pivotRowData.indices[i];
                    const v0 = pivotRowData.values[i];
                    if (v0 !== 0) {
                        reducedCosts[c] = reducedCosts[c] - coefficient * v0;
                    }
                }
                reducedCosts[pivotColumnIndex] = -coefficient * pivotVal;
            }
        }
    }
}

/**
 * Threshold for using sparse (total cells)
 * Currently disabled - CSC format overhead exceeds benefits.
 * A dual-indexed (CSC+CSR) approach would be needed for efficient sparse simplex.
 */
export const SPARSE_THRESHOLD = Infinity; // Disabled

/**
 * Density threshold - only use sparse if below this density
 */
export const DENSITY_THRESHOLD = 0.1; // 10%

/**
 * Check if sparse mode should be used for this tableau
 */
export function shouldUseSparse(tableau: Tableau): boolean {
    const totalCells = tableau.width * tableau.height;

    if (totalCells < SPARSE_THRESHOLD) {
        return false;
    }

    // Estimate density from constraint rows (skip row 0 which is cost row and often dense)
    const matrix = tableau.matrix;
    const width = tableau.width;
    const startRow = 1;
    const sampleRows = Math.min(20, tableau.height - 1);
    let nonZeros = 0;

    for (let r = startRow; r < startRow + sampleRows; r++) {
        const rowOffset = r * width;
        for (let c = 0; c < width; c++) {
            if (matrix[rowOffset + c] !== 0) {
                nonZeros++;
            }
        }
    }

    const estimatedDensity = nonZeros / (sampleRows * width);
    return estimatedDensity < DENSITY_THRESHOLD;
}
