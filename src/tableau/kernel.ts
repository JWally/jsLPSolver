/**
 * @file src/tableau/kernel.ts
 * @description WebAssembly SIMD kernel for the dense pivot row update
 *
 * The pivot's rank-1 update (row -= coefficient * pivotRow for every row) is
 * most of the solver's runtime. V8 does not vectorize the JS loop; the same
 * loop in WebAssembly with f64x2 runs 3-5x faster and gives bit-identical
 * results (a multiply and a subtract per entry, no fused multiply-add).
 *
 * WebAssembly can only touch its own memory, so a matrix that wants the
 * kernel is allocated inside a WebAssembly.Memory by allocMatrix, followed by
 * scratch space for the dense pivot row. Any other matrix, and any runtime
 * without WebAssembly SIMD, uses the JS update in simplex.ts.
 *
 * The module below is assembled from this text (wabt, simd enabled):
 *
 *     (module
 *       (memory (import "e" "mem") 1)
 *       ;; normalize(row, w, quot, p): divide the pivot row (byte offset row, w entries) by quot,
 *       ;; zero entries that are or become noise (|x| <= 1e-16), store the result in the matrix
 *       ;; and in the dense scratch row at p. Returns the number of entries kept.
 *       (func (export "normalize") (param $row i32) (param $w i32) (param $quot f64) (param $p i32) (result i32)
 *         (local $c i32) (local $end i32) (local $end2 i32) (local $n i32) (local $v v128) (local $x v128) (local $keep v128) (local $q v128) (local $eps v128) (local $s f64) (local $t f64)
 *         (local.set $q (f64x2.splat (local.get $quot)))
 *         (local.set $eps (f64x2.splat (f64.const 1e-16)))
 *         (local.set $c (local.get $row))
 *         (local.set $end (i32.add (local.get $row) (i32.shl (local.get $w) (i32.const 3))))
 *         (local.set $end2 (i32.sub (local.get $end) (i32.const 15)))
 *         (block $d (loop $l
 *           (br_if $d (i32.ge_u (local.get $c) (local.get $end2)))
 *           (local.set $v (v128.load (local.get $c)))
 *           (local.set $x (f64x2.div (local.get $v) (local.get $q)))
 *           (local.set $keep (v128.not (v128.or
 *             (f64x2.le (f64x2.abs (local.get $x)) (local.get $eps))
 *             (f64x2.le (f64x2.abs (local.get $v)) (local.get $eps)))))
 *           (local.set $x (v128.and (local.get $x) (local.get $keep)))
 *           (v128.store (local.get $c) (local.get $x))
 *           (v128.store (local.get $p) (local.get $x))
 *           (local.set $n (i32.add (local.get $n) (i32.popcnt (i64x2.bitmask (local.get $keep)))))
 *           (local.set $c (i32.add (local.get $c) (i32.const 16)))
 *           (local.set $p (i32.add (local.get $p) (i32.const 16)))
 *           (br $l)))
 *         (if (i32.lt_u (local.get $c) (local.get $end)) (then
 *           (local.set $s (f64.load (local.get $c)))
 *           (local.set $t (f64.div (local.get $s) (local.get $quot)))
 *           (if (i32.or
 *                 (f64.le (f64.abs (local.get $t)) (f64.const 1e-16))
 *                 (f64.le (f64.abs (local.get $s)) (f64.const 1e-16)))
 *             (then (local.set $t (f64.const 0)))
 *             (else (local.set $n (i32.add (local.get $n) (i32.const 1)))))
 *           (f64.store (local.get $c) (local.get $t))
 *           (f64.store (local.get $p) (local.get $t))))
 *         (local.get $n))
 *       (func (export "update") (param $p i32) (param $w i32) (param $h i32) (param $pr i32) (param $pc i32) (param $quot f64)
 *         (local $r i32) (local $row i32) (local $c i32) (local $end i32) (local $end2 i32) (local $end4 i32) (local $coef f64) (local $v v128) (local $q i32) (local $pcaddr i32)
 *         (block $done (loop $rows
 *           (br_if $done (i32.ge_u (local.get $r) (local.get $h)))
 *           (if (i32.ne (local.get $r) (local.get $pr)) (then
 *             (local.set $row (i32.shl (i32.mul (local.get $r) (local.get $w)) (i32.const 3)))
 *             (local.set $pcaddr (i32.add (local.get $row) (i32.shl (local.get $pc) (i32.const 3))))
 *             (local.set $coef (f64.load (local.get $pcaddr)))
 *             (if (i32.eqz (f64.le (f64.abs (local.get $coef)) (f64.const 1e-16))) (then
 *               (local.set $v (f64x2.splat (local.get $coef)))
 *               (local.set $c (local.get $row))
 *               (local.set $q (local.get $p))
 *               (local.set $end (i32.add (local.get $row) (i32.shl (local.get $w) (i32.const 3))))
 *               (local.set $end2 (i32.sub (local.get $end) (i32.const 15)))
 *               (local.set $end4 (i32.sub (local.get $end) (i32.const 63)))
 *               (block $d4 (loop $l4
 *                 (br_if $d4 (i32.ge_u (local.get $c) (local.get $end4)))
 *                 (v128.store offset=0 (local.get $c) (f64x2.sub (v128.load offset=0 (local.get $c)) (f64x2.mul (local.get $v) (v128.load offset=0 (local.get $q)))))
 *                 (v128.store offset=16 (local.get $c) (f64x2.sub (v128.load offset=16 (local.get $c)) (f64x2.mul (local.get $v) (v128.load offset=16 (local.get $q)))))
 *                 (v128.store offset=32 (local.get $c) (f64x2.sub (v128.load offset=32 (local.get $c)) (f64x2.mul (local.get $v) (v128.load offset=32 (local.get $q)))))
 *                 (v128.store offset=48 (local.get $c) (f64x2.sub (v128.load offset=48 (local.get $c)) (f64x2.mul (local.get $v) (v128.load offset=48 (local.get $q)))))
 *                 (local.set $c (i32.add (local.get $c) (i32.const 64)))
 *                 (local.set $q (i32.add (local.get $q) (i32.const 64)))
 *                 (br $l4)))
 *               (block $d2 (loop $l2
 *                 (br_if $d2 (i32.ge_u (local.get $c) (local.get $end2)))
 *                 (v128.store (local.get $c) (f64x2.sub (v128.load (local.get $c)) (f64x2.mul (local.get $v) (v128.load (local.get $q)))))
 *                 (local.set $c (i32.add (local.get $c) (i32.const 16)))
 *                 (local.set $q (i32.add (local.get $q) (i32.const 16)))
 *                 (br $l2)))
 *               (if (i32.lt_u (local.get $c) (local.get $end)) (then
 *                 (f64.store (local.get $c) (f64.sub (f64.load (local.get $c)) (f64.mul (local.get $coef) (f64.load (local.get $q)))))))
 *               (f64.store (local.get $pcaddr) (f64.div (f64.neg (local.get $coef)) (local.get $quot)))
 *             ))
 *           ))
 *           (local.set $r (i32.add (local.get $r) (i32.const 1)))
 *           (br $rows)))
 *       )
 *     )
 */

// prettier-ignore
const KERNEL_MODULE = new Uint8Array([
    0, 97, 115, 109, 1, 0, 0, 0, 1, 18, 2, 96, 4, 127, 127, 124, 127, 1, 127, 96,
    6, 127, 127, 127, 127, 127, 124, 0, 2, 10, 1, 1, 101, 3, 109, 101, 109, 2, 0, 1,
    3, 3, 2, 0, 1, 7, 22, 2, 9, 110, 111, 114, 109, 97, 108, 105, 122, 101, 0, 0,
    6, 117, 112, 100, 97, 116, 101, 0, 1, 10, 211, 4, 2, 240, 1, 3, 4, 127, 5, 123,
    2, 124, 32, 2, 253, 20, 33, 11, 68, 188, 137, 216, 151, 178, 210, 156, 60, 253, 20, 33,
    12, 32, 0, 33, 4, 32, 0, 32, 1, 65, 3, 116, 106, 33, 5, 32, 5, 65, 15, 107,
    33, 6, 2, 64, 3, 64, 32, 4, 32, 6, 79, 13, 1, 32, 4, 253, 0, 4, 0, 33,
    8, 32, 8, 32, 11, 253, 243, 1, 33, 9, 32, 9, 253, 236, 1, 32, 12, 253, 75, 32,
    8, 253, 236, 1, 32, 12, 253, 75, 253, 80, 253, 77, 33, 10, 32, 9, 32, 10, 253, 78,
    33, 9, 32, 4, 32, 9, 253, 11, 4, 0, 32, 3, 32, 9, 253, 11, 4, 0, 32, 7,
    32, 10, 253, 196, 1, 105, 106, 33, 7, 32, 4, 65, 16, 106, 33, 4, 32, 3, 65, 16,
    106, 33, 3, 12, 0, 11, 11, 32, 4, 32, 5, 73, 4, 64, 32, 4, 43, 3, 0, 33,
    13, 32, 13, 32, 2, 163, 33, 14, 32, 14, 153, 68, 188, 137, 216, 151, 178, 210, 156, 60,
    101, 32, 13, 153, 68, 188, 137, 216, 151, 178, 210, 156, 60, 101, 114, 4, 64, 68, 0, 0,
    0, 0, 0, 0, 0, 0, 33, 14, 5, 32, 7, 65, 1, 106, 33, 7, 11, 32, 4, 32,
    14, 57, 3, 0, 32, 3, 32, 14, 57, 3, 0, 11, 32, 7, 11, 222, 2, 4, 6, 127,
    1, 124, 1, 123, 2, 127, 2, 64, 3, 64, 32, 6, 32, 2, 79, 13, 1, 32, 6, 32,
    3, 71, 4, 64, 32, 6, 32, 1, 108, 65, 3, 116, 33, 7, 32, 7, 32, 4, 65, 3,
    116, 106, 33, 15, 32, 15, 43, 3, 0, 33, 12, 32, 12, 153, 68, 188, 137, 216, 151, 178,
    210, 156, 60, 101, 69, 4, 64, 32, 12, 253, 20, 33, 13, 32, 7, 33, 8, 32, 0, 33,
    14, 32, 7, 32, 1, 65, 3, 116, 106, 33, 9, 32, 9, 65, 15, 107, 33, 10, 32, 9,
    65, 63, 107, 33, 11, 2, 64, 3, 64, 32, 8, 32, 11, 79, 13, 1, 32, 8, 32, 8,
    253, 0, 4, 0, 32, 13, 32, 14, 253, 0, 4, 0, 253, 242, 1, 253, 241, 1, 253, 11,
    4, 0, 32, 8, 32, 8, 253, 0, 4, 16, 32, 13, 32, 14, 253, 0, 4, 16, 253, 242,
    1, 253, 241, 1, 253, 11, 4, 16, 32, 8, 32, 8, 253, 0, 4, 32, 32, 13, 32, 14,
    253, 0, 4, 32, 253, 242, 1, 253, 241, 1, 253, 11, 4, 32, 32, 8, 32, 8, 253, 0,
    4, 48, 32, 13, 32, 14, 253, 0, 4, 48, 253, 242, 1, 253, 241, 1, 253, 11, 4, 48,
    32, 8, 65, 192, 0, 106, 33, 8, 32, 14, 65, 192, 0, 106, 33, 14, 12, 0, 11, 11,
    2, 64, 3, 64, 32, 8, 32, 10, 79, 13, 1, 32, 8, 32, 8, 253, 0, 4, 0, 32,
    13, 32, 14, 253, 0, 4, 0, 253, 242, 1, 253, 241, 1, 253, 11, 4, 0, 32, 8, 65,
    16, 106, 33, 8, 32, 14, 65, 16, 106, 33, 14, 12, 0, 11, 11, 32, 8, 32, 9, 73,
    4, 64, 32, 8, 32, 8, 43, 3, 0, 32, 12, 32, 14, 43, 3, 0, 162, 161, 57, 3,
    0, 11, 32, 15, 32, 12, 154, 32, 5, 163, 57, 3, 0, 11, 11, 32, 6, 65, 1, 106,
    33, 6, 12, 0, 11, 11, 11,
]);

/** update(pivotRowByteOffset, width, height, pivotRow, pivotColumn, quotient) */
type UpdateFunction = (
    pivotRowOffset: number,
    width: number,
    height: number,
    pivotRow: number,
    pivotColumn: number,
    quotient: number
) => void;

/** normalize(pivotRowByteOffset, width, quotient, scratchByteOffset): entries kept */
type NormalizeFunction = (
    rowOffset: number,
    width: number,
    quotient: number,
    scratchOffset: number
) => number;

/** Kernel bound to one matrix allocation. */
export interface PivotKernel {
    update: UpdateFunction;
    /**
     * Divide the pivot row by the pivot element, zero entries that are or
     * become noise, and leave a dense copy in pivotRow.
     */
    normalize: NormalizeFunction;
    /** Dense pivot row scratch, in the same memory as the matrix. */
    pivotRow: Float64Array;
    /** Byte offset of pivotRow in the memory. */
    pivotRowOffset: number;
}

/** Matrices below this many cells stay plain arrays (setup would cost more than it saves). */
const MIN_CELLS = 2048;
const PAGE_BYTES = 65536;

type WebAssemblyApi = {
    Module: new (bytes: Uint8Array) => unknown;
    Instance: new (
        module: unknown,
        imports: Record<string, Record<string, unknown>>
    ) => { exports: Record<string, unknown> };
    Memory: new (descriptor: { initial: number }) => { buffer: ArrayBuffer };
};

let wasmModule: unknown | null | undefined;
const kernels = new WeakMap<Float64Array, PivotKernel>();

function kernelDisabled(): boolean {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
        ?.env;
    return env?.JSLP_NO_WASM === "1";
}

function getApi(): WebAssemblyApi | null {
    const api = (globalThis as { WebAssembly?: WebAssemblyApi }).WebAssembly;
    return api === undefined || kernelDisabled() ? null : api;
}

/**
 * Allocate a zeroed matrix of `cells` doubles. When the kernel is available
 * the matrix lives in WebAssembly memory with room for a pivot row of
 * `width` entries after it; otherwise this is a plain Float64Array.
 */
export function allocMatrix(cells: number, width: number): Float64Array {
    const api = cells >= MIN_CELLS ? getApi() : null;
    if (api === null) return new Float64Array(cells);
    try {
        if (wasmModule === undefined) wasmModule = new api.Module(KERNEL_MODULE);
        if (wasmModule === null) return new Float64Array(cells);
        const scratch = Math.max(width, 16) * 2;
        const bytes = (cells + scratch) * 8;
        const memory = new api.Memory({ initial: Math.ceil(bytes / PAGE_BYTES) });
        const instance = new api.Instance(wasmModule, { e: { mem: memory } });
        const matrix = new Float64Array(memory.buffer, 0, cells);
        kernels.set(matrix, {
            update: instance.exports.update as UpdateFunction,
            normalize: instance.exports.normalize as NormalizeFunction,
            pivotRow: new Float64Array(memory.buffer, cells * 8, scratch),
            pivotRowOffset: cells * 8,
        });
        return matrix;
    } catch {
        // No SIMD, or WebAssembly compilation is forbidden (CSP).
        wasmModule = null;
        return new Float64Array(cells);
    }
}

/** The kernel for a matrix from allocMatrix, if it has one. */
export function kernelOf(matrix: Float64Array): PivotKernel | undefined {
    return kernels.get(matrix);
}
