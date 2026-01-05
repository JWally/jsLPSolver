/**
 * @file src/tableau/sparse-matrix.ts
 * @description Compressed Sparse Column (CSC) matrix implementation
 *
 * Optimized for column operations which are frequent in the simplex algorithm.
 * Provides O(nnz) pivot operations instead of O(n*m) for dense matrices.
 *
 * CSC Storage Format:
 * - values: non-zero values stored column by column
 * - rowIndices: row index for each value
 * - colPointers: starting index in values/rowIndices for each column
 *
 * Column c's entries are at indices colPointers[c] to colPointers[c+1]-1
 */

// Sparse vector representation for intermediate operations
export interface SparseVector {
    indices: number[];
    values: number[];
    length: number;
}

export class SparseMatrix {
    // CSC format arrays
    values: number[];
    rowIndices: number[];
    colPointers: number[];

    // Dimensions
    nRows: number;
    nCols: number;

    // Precision for zero comparison
    private precision: number;

    // Pre-allocated workspace for operations
    private workVector: Float64Array;
    private workIndices: number[];

    constructor(nRows: number, nCols: number, precision = 1e-12) {
        this.nRows = nRows;
        this.nCols = nCols;
        this.precision = precision;

        // Initialize empty sparse matrix
        this.values = [];
        this.rowIndices = [];
        this.colPointers = new Array(nCols + 1).fill(0);

        // Workspace for row/column operations
        this.workVector = new Float64Array(Math.max(nRows, nCols));
        this.workIndices = [];
    }

    /**
     * Create sparse matrix from dense Float64Array
     */
    static fromDense(
        dense: Float64Array,
        width: number,
        height: number,
        precision = 1e-12
    ): SparseMatrix {
        const sparse = new SparseMatrix(height, width, precision);

        const values: number[] = [];
        const rowIndices: number[] = [];
        const colPointers: number[] = [0];

        // Build CSC by iterating column by column
        for (let c = 0; c < width; c++) {
            for (let r = 0; r < height; r++) {
                const val = dense[r * width + c];
                if (val < -precision || val > precision) {
                    values.push(val);
                    rowIndices.push(r);
                }
            }
            colPointers.push(values.length);
        }

        sparse.values = values;
        sparse.rowIndices = rowIndices;
        sparse.colPointers = colPointers;

        return sparse;
    }

    /**
     * Convert to dense Float64Array
     */
    toDense(): Float64Array {
        const dense = new Float64Array(this.nRows * this.nCols);

        for (let c = 0; c < this.nCols; c++) {
            const start = this.colPointers[c];
            const end = this.colPointers[c + 1];
            for (let i = start; i < end; i++) {
                const r = this.rowIndices[i];
                dense[r * this.nCols + c] = this.values[i];
            }
        }

        return dense;
    }

    /**
     * Get value at (row, col)
     */
    get(row: number, col: number): number {
        const start = this.colPointers[col];
        const end = this.colPointers[col + 1];

        // Binary search for row in this column
        let lo = start;
        let hi = end;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (this.rowIndices[mid] < row) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }

        if (lo < end && this.rowIndices[lo] === row) {
            return this.values[lo];
        }
        return 0;
    }

    /**
     * Set value at (row, col)
     * Handles insertion and removal of entries
     */
    set(row: number, col: number, value: number): void {
        const start = this.colPointers[col];
        const end = this.colPointers[col + 1];
        const isZero = value >= -this.precision && value <= this.precision;

        // Binary search for insertion point
        let lo = start;
        let hi = end;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (this.rowIndices[mid] < row) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }

        const exists = lo < end && this.rowIndices[lo] === row;

        if (exists) {
            if (isZero) {
                // Remove existing entry
                this.values.splice(lo, 1);
                this.rowIndices.splice(lo, 1);
                // Update column pointers
                for (let c = col + 1; c <= this.nCols; c++) {
                    this.colPointers[c]--;
                }
            } else {
                // Update existing entry
                this.values[lo] = value;
            }
        } else if (!isZero) {
            // Insert new entry
            this.values.splice(lo, 0, value);
            this.rowIndices.splice(lo, 0, row);
            // Update column pointers
            for (let c = col + 1; c <= this.nCols; c++) {
                this.colPointers[c]++;
            }
        }
    }

    /**
     * Get column as sparse vector
     */
    getColumn(col: number): SparseVector {
        const start = this.colPointers[col];
        const end = this.colPointers[col + 1];
        const len = end - start;

        return {
            indices: this.rowIndices.slice(start, end),
            values: this.values.slice(start, end),
            length: len,
        };
    }

    /**
     * Get row as sparse vector (less efficient - requires full scan)
     */
    getRow(row: number): SparseVector {
        const indices: number[] = [];
        const values: number[] = [];

        for (let c = 0; c < this.nCols; c++) {
            const val = this.get(row, c);
            if (val !== 0) {
                indices.push(c);
                values.push(val);
            }
        }

        return { indices, values, length: indices.length };
    }

    /**
     * Get row into pre-allocated dense array (more efficient for repeated access)
     * Returns array of non-zero column indices
     */
    getRowDense(row: number, output: Float64Array): number[] {
        const nonZeroCols: number[] = [];

        // Clear relevant portion
        output.fill(0, 0, this.nCols);

        for (let c = 0; c < this.nCols; c++) {
            const start = this.colPointers[c];
            const end = this.colPointers[c + 1];

            // Binary search for row
            let lo = start;
            let hi = end;
            while (lo < hi) {
                const mid = (lo + hi) >>> 1;
                if (this.rowIndices[mid] < row) {
                    lo = mid + 1;
                } else {
                    hi = mid;
                }
            }

            if (lo < end && this.rowIndices[lo] === row) {
                output[c] = this.values[lo];
                nonZeroCols.push(c);
            }
        }

        return nonZeroCols;
    }

    /**
     * Add a new row (expands matrix vertically)
     */
    addRow(): void {
        this.nRows++;
        if (this.workVector.length < this.nRows) {
            this.workVector = new Float64Array(this.nRows * 2);
        }
    }

    /**
     * Add a new column (expands matrix horizontally)
     */
    addColumn(): void {
        this.colPointers.push(this.colPointers[this.nCols]);
        this.nCols++;
        if (this.workVector.length < this.nCols) {
            this.workVector = new Float64Array(this.nCols * 2);
        }
    }

    /**
     * Set entire column from sparse vector
     */
    setColumn(col: number, sparseCol: SparseVector): void {
        const oldStart = this.colPointers[col];
        const oldEnd = this.colPointers[col + 1];
        const oldLen = oldEnd - oldStart;
        const newLen = sparseCol.length;
        const diff = newLen - oldLen;

        if (diff !== 0) {
            // Need to resize
            if (diff > 0) {
                // Make room
                for (let i = 0; i < diff; i++) {
                    this.values.splice(oldEnd, 0, 0);
                    this.rowIndices.splice(oldEnd, 0, 0);
                }
            } else {
                // Remove excess
                this.values.splice(oldStart, -diff);
                this.rowIndices.splice(oldStart, -diff);
            }

            // Update column pointers
            for (let c = col + 1; c <= this.nCols; c++) {
                this.colPointers[c] += diff;
            }
        }

        // Copy new values
        const start = this.colPointers[col];
        for (let i = 0; i < newLen; i++) {
            this.values[start + i] = sparseCol.values[i];
            this.rowIndices[start + i] = sparseCol.indices[i];
        }
    }

    /**
     * Number of non-zero entries
     */
    get nnz(): number {
        return this.values.length;
    }

    /**
     * Density (fraction of non-zeros)
     */
    get density(): number {
        return this.nnz / (this.nRows * this.nCols);
    }

    /**
     * Scale a row by a factor
     */
    scaleRow(row: number, factor: number): void {
        for (let c = 0; c < this.nCols; c++) {
            const start = this.colPointers[c];
            const end = this.colPointers[c + 1];

            for (let i = start; i < end; i++) {
                if (this.rowIndices[i] === row) {
                    this.values[i] *= factor;
                    break;
                }
            }
        }
    }

    /**
     * Add scaled row to another row: targetRow += factor * sourceRow
     * This is the core operation in Gaussian elimination / pivot
     */
    addScaledRow(targetRow: number, sourceRow: number, factor: number): void {
        if (factor >= -this.precision && factor <= this.precision) {
            return;
        }

        // Get source row as dense for efficiency
        const sourceNonZeros = this.getRowDense(sourceRow, this.workVector);

        // Add scaled source to target
        for (const c of sourceNonZeros) {
            const sourceVal = this.workVector[c];
            const newVal = this.get(targetRow, c) + factor * sourceVal;
            this.set(targetRow, c, newVal);
        }
    }

    /**
     * Perform pivot operation at (pivotRow, pivotCol)
     * This is optimized for sparse operations
     */
    pivot(pivotRow: number, pivotCol: number): number[] {
        const pivotVal = this.get(pivotRow, pivotCol);
        if (pivotVal === 0) {
            throw new Error("Cannot pivot on zero element");
        }

        const invPivot = 1 / pivotVal;

        // Get pivot row as dense
        const pivotRowNonZeros = this.getRowDense(pivotRow, this.workVector);

        // Scale pivot row
        for (const c of pivotRowNonZeros) {
            this.workVector[c] *= invPivot;
        }
        this.workVector[pivotCol] = invPivot;

        // Update pivot row in matrix
        for (const c of pivotRowNonZeros) {
            this.set(pivotRow, c, this.workVector[c]);
        }
        this.set(pivotRow, pivotCol, invPivot);

        // Get pivot column to find rows that need updating
        const pivotColData = this.getColumn(pivotCol);

        // Update all other rows
        for (let i = 0; i < pivotColData.length; i++) {
            const r = pivotColData.indices[i];
            if (r === pivotRow) continue;

            const coefficient = pivotColData.values[i];
            if (coefficient >= -this.precision && coefficient <= this.precision) continue;

            // row[r] -= coefficient * pivotRow
            for (const c of pivotRowNonZeros) {
                if (c === pivotCol) continue;
                const pivotRowVal = this.workVector[c];
                if (pivotRowVal >= -this.precision && pivotRowVal <= this.precision) continue;

                const newVal = this.get(r, c) - coefficient * pivotRowVal;
                this.set(r, c, newVal);
            }

            // Set pivot column value for this row
            this.set(r, pivotCol, -coefficient * invPivot);
        }

        return pivotRowNonZeros;
    }

    /**
     * Clone the matrix
     */
    clone(): SparseMatrix {
        const copy = new SparseMatrix(this.nRows, this.nCols, this.precision);
        copy.values = this.values.slice();
        copy.rowIndices = this.rowIndices.slice();
        copy.colPointers = this.colPointers.slice();
        return copy;
    }
}
