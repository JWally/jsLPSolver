# Performance Optimization Lessons

This document tracks performance optimization attempts for jsLPSolver, what worked, and what didn't.

## What Worked

### 1. Int32Array for Column Tracking (10-15% improvement)

Changed `nonZeroColumns` from `number[]` to `Int32Array` in the pivot function.

- Better cache locality with typed arrays
- Pre-allocated with dynamic growth when needed
- JS engines optimize typed array access

```typescript
// Before
const nonZeroColumns: number[] = [];

// After
let nonZeroColumns = new Int32Array(1024);
```

### 2. Pre-computed Inverse Quotient (5-10% improvement)

In the pivot loop, pre-compute `1/quotient` once instead of dividing repeatedly.

```typescript
// Before
for (let c = 0; c < nNonZeroColumns; c++) {
    matrix[rowOffset + col] -= val / quotient;
}

// After
const invQuotient = 1 / quotient;
for (let c = 0; c < nNonZeroColumns; c++) {
    matrix[rowOffset + col] -= val * invQuotient;
}
```

**Note**: Must still use division (not multiplication) for the pivot row normalization itself, or numerical precision issues affect MIP branching.

### 3. Cached Array References Outside Loops (5-10% improvement)

Cache frequently accessed object properties before hot loops:

```typescript
// Before
for (let r = 1; r <= lastRow; r++) {
    const varIndex = this.varIndexByRow[r];
    if (this.unrestrictedVars[varIndex]) { ... }
}

// After
const varIndexByRow = this.varIndexByRow;
const unrestrictedVars = this.unrestrictedVars;
for (let r = 1; r <= lastRow; r++) {
    const varIndex = varIndexByRow[r];
    if (unrestrictedVars[varIndex]) { ... }
}
```

### 4. Simplified Cost Row Offset

Since `costRowIndex` is always 0, `costRowOffset = costRowIndex * width` is always 0. Removed the variable entirely.

## What Made Things Worse

### 1. Incremental Branch-and-Cut (-43% to -203% slower)

The existing `useIncremental: true` option was tested and found to be significantly slower:

- Monster II: 203% slower with incremental
- Vendor Selection: 43% slower with incremental

The overhead of maintaining incremental state exceeds the benefit of avoiding full re-solves.

### 2. Dual Simplex for B&C Warm-Starts (18 tests failed)

Attempted to use dual simplex after adding cut constraints in branch-and-cut:

```typescript
// Attempted but reverted
tableau.addCutConstraints(branchingCuts);
tableau.dualSimplex(); // Instead of tableau.simplex()
```

**Why it failed**: When `addCutConstraints()` modifies the tableau, it changes the basis structure in ways that invalidate the dual feasibility assumption. The cuts aren't simple bound changes - they restructure the problem.

The dual simplex function was kept as a utility for potential future use cases where it's applicable.

### 3. Removing "Redundant" Zero Checks in Pivot (tests failed)

Attempted to remove nested zero checks that appeared redundant:

```typescript
// Original (works)
if (row[pivotColumnIndex] !== 0) {
    for (let c = 0; c < nNonZeroColumns; c++) {
        const col = nonZeroColumns[c];
        if (pivotRowCache[col] !== 0) {
            // This check seems redundant
            // ... update
        }
    }
}

// Attempted removal (broke tests)
if (row[pivotColumnIndex] !== 0) {
    for (let c = 0; c < nNonZeroColumns; c++) {
        const col = nonZeroColumns[c];
        // Removed inner check - causes numerical drift
        // ... update
    }
}
```

**Why it failed**: Even though `nonZeroColumns` should only contain non-zero columns, the inner check prevents accumulation of floating-point errors. Removing it causes tiny numerical differences that compound during MIP branching, leading to different (though mathematically valid) solutions that don't match expected test outputs.

### 4. Using Multiplication Instead of Division for Pivot Row Normalization

```typescript
// Original (works)
matrix[pivotRowOffset + c] = matrix[pivotRowOffset + c] / quotient;

// Attempted (broke tests)
matrix[pivotRowOffset + c] = matrix[pivotRowOffset + c] * invQuotient;
```

**Why it failed**: Same numerical precision issue. The pivot row values must be computed with division to maintain precision. Multiplication by inverse introduces small errors that affect MIP branching decisions.

## Mixed Results (Problem-Dependent)

### 5. Replacing Math.round with Floor-Based Calculation

In `getMostFractionalVar()` and `isIntegral()`, replaced `Math.abs(value - Math.round(value))` with floor-based distance calculation:

```typescript
// Before
const fraction = Math.abs(varValue - Math.round(varValue));

// After
const floorVal = Math.floor(varValue);
const fracPart = varValue - floorVal;
const fraction = fracPart <= 0.5 ? fracPart : 1 - fracPart;
```

**Results**:

- Monster II: ~16% faster
- Vendor Selection: ~8% slower

The improvement depends on problem structure. `Math.round` vs `Math.floor` has similar performance in modern JS engines, but the conditional branching pattern may affect different problems differently.

### 6. Object Pooling in Min-Heap

Added object pooling for HeapEntry objects to reduce GC pressure:

```typescript
private allocEntry(branch: Branch, seq: number): HeapEntry {
    if (this.poolSize > 0) {
        const entry = this.pool[--this.poolSize];
        entry.branch = branch;
        entry.seq = seq;
        return entry;
    }
    return { branch, seq };
}
```

**Results**: Marginal impact. GC in modern V8 is very efficient for short-lived objects. Pooling adds overhead that may not be offset by reduced allocations.

### 7. Skipping Zero Coefficients in MIR Cuts

Added early-exit for near-zero coefficients in cut generation:

```typescript
if (coefficient > -precision && coefficient < precision) {
    mat[newRowOffset + colIndex] = 0;
    continue;
}
```

**Results**: Mixed. Helps sparse problems, but the additional branch may hurt dense problems.

### 8. Caching Fractional Volume in MIR Loop

Instead of computing fractional volume twice per iteration:

```typescript
// Before: computed before AND after applyMIRCuts
const fractionalVolumeBefore = tableau.computeFractionalVolume(true);
tableau.applyMIRCuts();
const fractionalVolumeAfter = tableau.computeFractionalVolume(true);

// After: reuse previous "after" as next "before"
let fractionalVolume = tableau.computeFractionalVolume(true);
while (fractionalVolume > 0) {
    tableau.applyMIRCuts();
    const after = tableau.computeFractionalVolume(true);
    if (after >= 0.9 * fractionalVolume) break;
    fractionalVolume = after;
}
```

**Results**: Marginal improvement. The MIR cut loop typically runs only 1-3 iterations.

## Investigated But Not Yet Implemented

### 1. Sparse Matrix Representation

The codebase has `sparse-simplex.ts` and `sparse-matrix.ts` for sparse problems. **Currently disabled** (`SPARSE_THRESHOLD = Infinity`). The comment notes that a dual-indexed (CSC+CSR) approach would be needed for efficient sparse simplex.

If re-enabled, potential improvements:

- The `setColumn` function uses repeated `splice()` calls in a loop - could be batched
- `getColumn` and `getRow` allocate new arrays - could use object pooling
- `getRow` is O(n log m) due to binary search per column - could use row index

### 2. Partial Pricing

`pricingBatchStart` and `pricingBatchSize` exist for partial pricing in phase2. Currently `pricingBatchSize = 0` means auto-compute. Could be tuned.

### 3. Better Variable Selection in Branching

`getMostFractionalVar()` is used for branching. Alternative strategies exist (`getFractionalVarWithLowestCost()`) but aren't used by default.

### 4. Cut Generation Efficiency

MIR cuts are applied iteratively until fractional volume stops improving. The 0.9 threshold could be tuned.

## Performance Baseline (After Optimizations)

| Problem                | Time (ms) |
| ---------------------- | --------- |
| Small LP (20x10)       | 0.036     |
| Medium LP (100x50)     | 3.223     |
| Large LP (300x150)     | 62.753    |
| Monster Problem (MIP)  | 4.736     |
| Monster II (MIP)       | 150.081   |
| Vendor Selection (MIP) | 827.119   |

## Key Insights

1. **Numerical precision matters more than speed in MIP**: Many "obvious" optimizations break integer programming because tiny floating-point differences cascade through branching decisions.

2. **JS typed arrays are fast**: `Float64Array` and `Int32Array` provide near-native performance. The codebase already uses `Float64Array` for the main matrix.

3. **Property access has overhead**: Caching `this.property` into local variables before tight loops provides measurable gains.

4. **WASM doesn't always win**: Previous attempts at WASM implementations lost to the JS version, likely due to garbage collection overhead at the JS/WASM boundary.

5. **The simplex pivot is the hot path**: Most time is spent in the pivot operation. Optimizations there have the highest impact.

6. **MIP performance is problem-dependent**: Unlike LP (pure simplex), MIP performance depends heavily on problem structure. An optimization that helps one problem may hurt another due to different branching paths.

7. **Benchmark variance is high**: CPU throttling, background processes, and JIT warmup can cause 2x variance in benchmark results. Always compare before/after in quick succession, and run multiple times.

8. **Modern JS engines are smart**: V8's GC is highly optimized for short-lived objects. Object pooling may not help and can add overhead. Similarly, `Math.round` vs `Math.floor` optimizations may be negligible.

## Future Ideas to Explore

1. **Presolve improvements**: The presolve phase could eliminate more variables/constraints before solving.

2. **Strong branching**: Currently uses simple most-fractional variable selection. Strong branching (try both directions briefly) could prune more nodes.

3. **Cut selection**: Not all cuts are equally effective. Selecting the most violated cuts could improve convergence.

4. **Parallel B&C**: Web Workers could explore multiple branches in parallel (requires careful state management).

5. **Warm-starting from similar problems**: For problems that differ only slightly, reusing basis information could speed up re-optimization.
