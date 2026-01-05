import { describe, it, expect } from "vitest";
import { SparseMatrix } from "./sparse-matrix";

describe("SparseMatrix", () => {
    describe("constructor", () => {
        it("creates an empty sparse matrix with given dimensions", () => {
            const matrix = new SparseMatrix(3, 4);

            expect(matrix.nRows).toBe(3);
            expect(matrix.nCols).toBe(4);
            expect(matrix.nnz).toBe(0);
        });

        it("initializes column pointers to zeros", () => {
            const matrix = new SparseMatrix(3, 4);

            expect(matrix.colPointers).toHaveLength(5); // nCols + 1
            expect(matrix.colPointers.every((p) => p === 0)).toBe(true);
        });

        it("uses default precision of 1e-12", () => {
            const matrix = new SparseMatrix(3, 4);

            // Set a very small value - should be treated as zero
            matrix.set(0, 0, 1e-13);
            expect(matrix.get(0, 0)).toBe(0);
        });

        it("accepts custom precision", () => {
            const matrix = new SparseMatrix(3, 4, 1e-6);

            // Value larger than precision should be stored
            matrix.set(0, 0, 1e-5);
            expect(matrix.get(0, 0)).toBe(1e-5);
        });
    });

    describe("fromDense", () => {
        it("creates sparse matrix from dense array", () => {
            const dense = new Float64Array([
                1, 0, 2,
                0, 3, 0,
                4, 0, 5,
            ]);

            const sparse = SparseMatrix.fromDense(dense, 3, 3);

            expect(sparse.nRows).toBe(3);
            expect(sparse.nCols).toBe(3);
            expect(sparse.nnz).toBe(5);
        });

        it("correctly stores non-zero values", () => {
            const dense = new Float64Array([
                1, 0, 2,
                0, 3, 0,
                4, 0, 5,
            ]);

            const sparse = SparseMatrix.fromDense(dense, 3, 3);

            expect(sparse.get(0, 0)).toBe(1);
            expect(sparse.get(0, 1)).toBe(0);
            expect(sparse.get(0, 2)).toBe(2);
            expect(sparse.get(1, 1)).toBe(3);
            expect(sparse.get(2, 0)).toBe(4);
            expect(sparse.get(2, 2)).toBe(5);
        });

        it("treats values within precision as zero", () => {
            const dense = new Float64Array([
                1, 1e-15, 0,
                0, 0, 0,
                0, 0, 1,
            ]);

            const sparse = SparseMatrix.fromDense(dense, 3, 3);

            expect(sparse.nnz).toBe(2); // Only 1 and 1 are stored
        });

        it("handles all-zero matrix", () => {
            const dense = new Float64Array(9);

            const sparse = SparseMatrix.fromDense(dense, 3, 3);

            expect(sparse.nnz).toBe(0);
        });

        it("handles full matrix", () => {
            const dense = new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);

            const sparse = SparseMatrix.fromDense(dense, 3, 3);

            expect(sparse.nnz).toBe(9);
        });
    });

    describe("toDense", () => {
        it("converts sparse matrix back to dense array", () => {
            const original = new Float64Array([
                1, 0, 2,
                0, 3, 0,
                4, 0, 5,
            ]);

            const sparse = SparseMatrix.fromDense(original, 3, 3);
            const dense = sparse.toDense();

            expect(dense).toEqual(original);
        });

        it("handles empty matrix", () => {
            const sparse = new SparseMatrix(3, 3);
            const dense = sparse.toDense();

            expect(dense).toEqual(new Float64Array(9));
        });
    });

    describe("get", () => {
        it("returns value at specified position", () => {
            const dense = new Float64Array([
                1, 2, 3,
                4, 5, 6,
            ]);

            const sparse = SparseMatrix.fromDense(dense, 3, 2);

            expect(sparse.get(0, 0)).toBe(1);
            expect(sparse.get(0, 2)).toBe(3);
            expect(sparse.get(1, 1)).toBe(5);
        });

        it("returns 0 for positions with no stored value", () => {
            const dense = new Float64Array([
                1, 0, 0,
                0, 0, 0,
                0, 0, 2,
            ]);

            const sparse = SparseMatrix.fromDense(dense, 3, 3);

            expect(sparse.get(0, 1)).toBe(0);
            expect(sparse.get(1, 1)).toBe(0);
        });

        it("uses binary search to find values efficiently", () => {
            // Create a larger matrix to test binary search
            const size = 100;
            const sparse = new SparseMatrix(size, size);

            // Set values at specific positions
            sparse.set(50, 50, 42);
            sparse.set(25, 50, 25);
            sparse.set(75, 50, 75);

            expect(sparse.get(50, 50)).toBe(42);
            expect(sparse.get(25, 50)).toBe(25);
            expect(sparse.get(75, 50)).toBe(75);
            expect(sparse.get(0, 50)).toBe(0);
        });
    });

    describe("set", () => {
        it("adds new non-zero entry", () => {
            const sparse = new SparseMatrix(3, 3);

            sparse.set(1, 1, 5);

            expect(sparse.get(1, 1)).toBe(5);
            expect(sparse.nnz).toBe(1);
        });

        it("updates existing entry", () => {
            const sparse = new SparseMatrix(3, 3);

            sparse.set(1, 1, 5);
            sparse.set(1, 1, 10);

            expect(sparse.get(1, 1)).toBe(10);
            expect(sparse.nnz).toBe(1);
        });

        it("removes entry when setting to zero", () => {
            const sparse = new SparseMatrix(3, 3);

            sparse.set(1, 1, 5);
            expect(sparse.nnz).toBe(1);

            sparse.set(1, 1, 0);
            expect(sparse.get(1, 1)).toBe(0);
            expect(sparse.nnz).toBe(0);
        });

        it("treats values within precision as zero", () => {
            const sparse = new SparseMatrix(3, 3, 1e-6);

            sparse.set(1, 1, 1e-7);

            expect(sparse.get(1, 1)).toBe(0);
            expect(sparse.nnz).toBe(0);
        });

        it("updates column pointers correctly when inserting", () => {
            const sparse = new SparseMatrix(3, 3);

            sparse.set(0, 0, 1);
            sparse.set(1, 1, 2);
            sparse.set(2, 2, 3);

            // Each column should have exactly one entry
            expect(sparse.colPointers[0]).toBe(0);
            expect(sparse.colPointers[1]).toBe(1);
            expect(sparse.colPointers[2]).toBe(2);
            expect(sparse.colPointers[3]).toBe(3);
        });

        it("updates column pointers correctly when removing", () => {
            const sparse = new SparseMatrix(3, 3);

            sparse.set(0, 0, 1);
            sparse.set(1, 0, 2);
            sparse.set(0, 1, 3);

            expect(sparse.nnz).toBe(3);

            sparse.set(1, 0, 0); // Remove entry

            expect(sparse.nnz).toBe(2);
            expect(sparse.colPointers[1]).toBe(1); // Column 0 now has 1 entry
        });

        it("does nothing when setting non-existent entry to zero", () => {
            const sparse = new SparseMatrix(3, 3);

            sparse.set(1, 1, 0);

            expect(sparse.nnz).toBe(0);
        });

        it("handles negative values", () => {
            const sparse = new SparseMatrix(3, 3);

            sparse.set(1, 1, -5);

            expect(sparse.get(1, 1)).toBe(-5);
        });
    });

    describe("getColumn", () => {
        it("returns sparse vector for column", () => {
            const dense = new Float64Array([
                1, 0, 0,
                2, 0, 0,
                3, 0, 0,
            ]);

            const sparse = SparseMatrix.fromDense(dense, 3, 3);
            const col = sparse.getColumn(0);

            expect(col.indices).toEqual([0, 1, 2]);
            expect(col.values).toEqual([1, 2, 3]);
            expect(col.length).toBe(3);
        });

        it("returns empty sparse vector for zero column", () => {
            const dense = new Float64Array([
                1, 0, 0,
                0, 0, 0,
                0, 0, 2,
            ]);

            const sparse = SparseMatrix.fromDense(dense, 3, 3);
            const col = sparse.getColumn(1);

            expect(col.indices).toEqual([]);
            expect(col.values).toEqual([]);
            expect(col.length).toBe(0);
        });
    });

    describe("getRow", () => {
        it("returns sparse vector for row", () => {
            const dense = new Float64Array([
                1, 2, 3,
                0, 0, 0,
                0, 0, 0,
            ]);

            const sparse = SparseMatrix.fromDense(dense, 3, 3);
            const row = sparse.getRow(0);

            expect(row.indices).toEqual([0, 1, 2]);
            expect(row.values).toEqual([1, 2, 3]);
            expect(row.length).toBe(3);
        });

        it("returns empty sparse vector for zero row", () => {
            const dense = new Float64Array([
                1, 0, 0,
                0, 0, 0,
                0, 0, 2,
            ]);

            const sparse = SparseMatrix.fromDense(dense, 3, 3);
            const row = sparse.getRow(1);

            expect(row.indices).toEqual([]);
            expect(row.values).toEqual([]);
            expect(row.length).toBe(0);
        });
    });

    describe("getRowDense", () => {
        it("fills output array with row values and returns non-zero columns", () => {
            const dense = new Float64Array([
                1, 0, 3,
                0, 0, 0,
                0, 0, 0,
            ]);

            const sparse = SparseMatrix.fromDense(dense, 3, 3);
            const output = new Float64Array(3);
            const nonZeroCols = sparse.getRowDense(0, output);

            expect(output[0]).toBe(1);
            expect(output[1]).toBe(0);
            expect(output[2]).toBe(3);
            expect(nonZeroCols).toEqual([0, 2]);
        });

        it("clears output array before filling", () => {
            const sparse = new SparseMatrix(3, 3);
            sparse.set(0, 0, 5);

            const output = new Float64Array([99, 99, 99]);
            sparse.getRowDense(0, output);

            expect(output[0]).toBe(5);
            expect(output[1]).toBe(0);
            expect(output[2]).toBe(0);
        });
    });

    describe("addRow", () => {
        it("increases row count", () => {
            const sparse = new SparseMatrix(3, 3);

            sparse.addRow();

            expect(sparse.nRows).toBe(4);
        });

        it("expands work vector if needed", () => {
            const sparse = new SparseMatrix(2, 2);

            sparse.addRow();
            sparse.addRow();
            sparse.addRow();

            expect(sparse.nRows).toBe(5);
            // Should be able to set values in new rows
            sparse.set(4, 0, 10);
            expect(sparse.get(4, 0)).toBe(10);
        });
    });

    describe("addColumn", () => {
        it("increases column count", () => {
            const sparse = new SparseMatrix(3, 3);

            sparse.addColumn();

            expect(sparse.nCols).toBe(4);
        });

        it("adds new column pointer", () => {
            const sparse = new SparseMatrix(3, 3);

            sparse.addColumn();

            expect(sparse.colPointers).toHaveLength(5);
        });

        it("allows setting values in new column", () => {
            const sparse = new SparseMatrix(3, 3);

            sparse.addColumn();
            sparse.set(1, 3, 42);

            expect(sparse.get(1, 3)).toBe(42);
        });
    });

    describe("setColumn", () => {
        it("sets entire column from sparse vector", () => {
            const sparse = new SparseMatrix(3, 3);

            sparse.setColumn(1, {
                indices: [0, 2],
                values: [5, 10],
                length: 2,
            });

            expect(sparse.get(0, 1)).toBe(5);
            expect(sparse.get(1, 1)).toBe(0);
            expect(sparse.get(2, 1)).toBe(10);
        });

        it("replaces existing column values", () => {
            const sparse = new SparseMatrix(3, 3);
            sparse.set(0, 1, 1);
            sparse.set(1, 1, 2);
            sparse.set(2, 1, 3);

            sparse.setColumn(1, {
                indices: [1],
                values: [99],
                length: 1,
            });

            expect(sparse.get(0, 1)).toBe(0);
            expect(sparse.get(1, 1)).toBe(99);
            expect(sparse.get(2, 1)).toBe(0);
        });

        it("handles expanding column size", () => {
            const sparse = new SparseMatrix(5, 3);
            sparse.set(0, 1, 1);

            sparse.setColumn(1, {
                indices: [0, 1, 2, 3],
                values: [10, 20, 30, 40],
                length: 4,
            });

            expect(sparse.get(0, 1)).toBe(10);
            expect(sparse.get(3, 1)).toBe(40);
        });

        it("handles shrinking column size", () => {
            const sparse = new SparseMatrix(5, 3);
            sparse.set(0, 1, 1);
            sparse.set(1, 1, 2);
            sparse.set(2, 1, 3);
            sparse.set(3, 1, 4);

            sparse.setColumn(1, {
                indices: [1],
                values: [99],
                length: 1,
            });

            expect(sparse.nnz).toBe(1);
            expect(sparse.get(1, 1)).toBe(99);
        });
    });

    describe("nnz", () => {
        it("returns number of non-zero entries", () => {
            const sparse = new SparseMatrix(3, 3);

            sparse.set(0, 0, 1);
            sparse.set(1, 1, 2);
            sparse.set(2, 2, 3);

            expect(sparse.nnz).toBe(3);
        });
    });

    describe("density", () => {
        it("returns fraction of non-zero entries", () => {
            const sparse = new SparseMatrix(2, 2);

            sparse.set(0, 0, 1);
            sparse.set(1, 1, 2);

            expect(sparse.density).toBe(0.5);
        });

        it("returns 0 for empty matrix", () => {
            const sparse = new SparseMatrix(3, 3);
            expect(sparse.density).toBe(0);
        });

        it("returns 1 for full matrix", () => {
            const dense = new Float64Array([1, 2, 3, 4]);
            const sparse = SparseMatrix.fromDense(dense, 2, 2);

            expect(sparse.density).toBe(1);
        });
    });

    describe("scaleRow", () => {
        it("scales all values in a row by factor", () => {
            const dense = new Float64Array([
                1, 2, 3,
                4, 5, 6,
                7, 8, 9,
            ]);

            const sparse = SparseMatrix.fromDense(dense, 3, 3);
            sparse.scaleRow(1, 2);

            expect(sparse.get(1, 0)).toBe(8);
            expect(sparse.get(1, 1)).toBe(10);
            expect(sparse.get(1, 2)).toBe(12);
        });

        it("does not affect other rows", () => {
            const dense = new Float64Array([
                1, 2, 3,
                4, 5, 6,
                7, 8, 9,
            ]);

            const sparse = SparseMatrix.fromDense(dense, 3, 3);
            sparse.scaleRow(1, 2);

            expect(sparse.get(0, 0)).toBe(1);
            expect(sparse.get(2, 2)).toBe(9);
        });
    });

    describe("addScaledRow", () => {
        it("adds scaled source row to target row", () => {
            const dense = new Float64Array([
                1, 2, 3,
                4, 5, 6,
                0, 0, 0,
            ]);

            const sparse = SparseMatrix.fromDense(dense, 3, 3);
            sparse.addScaledRow(2, 0, 2); // row2 += 2 * row0

            expect(sparse.get(2, 0)).toBe(2);
            expect(sparse.get(2, 1)).toBe(4);
            expect(sparse.get(2, 2)).toBe(6);
        });

        it("does nothing when factor is zero", () => {
            const sparse = new SparseMatrix(3, 3);
            sparse.set(0, 0, 5);
            sparse.set(1, 0, 10);

            sparse.addScaledRow(1, 0, 0);

            expect(sparse.get(1, 0)).toBe(10);
        });

        it("does nothing when factor is within precision of zero", () => {
            const sparse = new SparseMatrix(3, 3, 1e-6);
            sparse.set(0, 0, 5);
            sparse.set(1, 0, 10);

            sparse.addScaledRow(1, 0, 1e-7);

            expect(sparse.get(1, 0)).toBe(10);
        });
    });

    describe("pivot", () => {
        it("performs pivot operation correctly", () => {
            // Simple 2x2 identity-like matrix
            const sparse = new SparseMatrix(2, 2);
            sparse.set(0, 0, 2);
            sparse.set(0, 1, 1);
            sparse.set(1, 0, 1);
            sparse.set(1, 1, 1);

            sparse.pivot(0, 0);

            // After pivot on (0,0) with value 2:
            // Row 0 gets divided by 2: [1, 0.5]
            // Row 1: [1, 1] - 1*[1, 0.5] = [0, 0.5]
            // But pivot column gets special treatment
            expect(sparse.get(0, 0)).toBe(0.5);
            expect(sparse.get(0, 1)).toBe(0.5);
        });

        it("throws error when pivoting on zero", () => {
            const sparse = new SparseMatrix(2, 2);

            expect(() => sparse.pivot(0, 0)).toThrow("Cannot pivot on zero element");
        });

        it("returns non-zero columns in pivot row", () => {
            const sparse = new SparseMatrix(3, 3);
            sparse.set(0, 0, 1);
            sparse.set(0, 1, 2);
            sparse.set(0, 2, 3);

            const nonZeroCols = sparse.pivot(0, 0);

            expect(nonZeroCols).toContain(0);
            expect(nonZeroCols).toContain(1);
            expect(nonZeroCols).toContain(2);
        });
    });

    describe("clone", () => {
        it("creates independent copy", () => {
            const original = new SparseMatrix(3, 3);
            original.set(0, 0, 1);
            original.set(1, 1, 2);

            const copy = original.clone();

            expect(copy.get(0, 0)).toBe(1);
            expect(copy.get(1, 1)).toBe(2);
            expect(copy.nRows).toBe(3);
            expect(copy.nCols).toBe(3);
        });

        it("modifications to clone do not affect original", () => {
            const original = new SparseMatrix(3, 3);
            original.set(0, 0, 1);

            const copy = original.clone();
            copy.set(0, 0, 99);

            expect(original.get(0, 0)).toBe(1);
            expect(copy.get(0, 0)).toBe(99);
        });

        it("modifications to original do not affect clone", () => {
            const original = new SparseMatrix(3, 3);
            original.set(0, 0, 1);

            const copy = original.clone();
            original.set(0, 0, 99);

            expect(original.get(0, 0)).toBe(99);
            expect(copy.get(0, 0)).toBe(1);
        });
    });
});
