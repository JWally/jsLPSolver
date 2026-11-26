# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-11-25

### Performance

- **Warm-started branch and bound** - Nodes are solved from their parent's tableau (plunging and parent snapshots) instead of from the root, and branching changes column bounds instead of adding rows. Single-variable constraints and binaries on MIPs become column bounds too. ([#168](https://github.com/JWally/jsLPSolver/pull/168))
- **Deterministic search** - The choice between resuming a node and re-solving it is costed in work units, not wall-clock time, so the same model always explores the same tree. ([#169](https://github.com/JWally/jsLPSolver/pull/169))
- **Reliability branching, Devex pricing, root presolve and Gomory cuts** ([#170](https://github.com/JWally/jsLPSolver/pull/170))
- **Root c-MIR cuts** with variable-upper-bound substitution ([#171](https://github.com/JWally/jsLPSolver/pull/171))
- **Faster pivot** - Dense pivot rows take a straight, unrolled row update: 5-29% faster on MIPLIB with identical node counts. ([#177](https://github.com/JWally/jsLPSolver/pull/177))
- **WebAssembly SIMD pivot kernel** - The pivot's row update runs in a 262-byte embedded WebAssembly module where available, with the tableau matrix held in WebAssembly memory. Results are bit-identical to the JS loop; most MIPLIB instances are 1.3-2.5x faster and mid-size LPs 25-45% faster. Matrices under 2048 cells, runtimes without WebAssembly SIMD and `JSLP_NO_WASM=1` use the JS update. ([#189](https://github.com/JWally/jsLPSolver/pull/189))

### Fixed

- **Simplex hangs, false infeasibility and false unboundedness** on several Netlib LPs (share1b, share2b, brandy, boeing2, e226, agg): cold starts fall back to a sum-of-infeasibilities phase 1, and phase 2 uses a Harris two-pass ratio test. ([#168](https://github.com/JWally/jsLPSolver/pull/168), [#170](https://github.com/JWally/jsLPSolver/pull/170))
- **Explicit `0` coefficient makes a feasible model infeasible** - Presolve read `0x <= 2` as a bound on `x`. ([#174](https://github.com/JWally/jsLPSolver/issues/174), fixed in [#175](https://github.com/JWally/jsLPSolver/pull/175) by [@bardrop](https://github.com/bardrop), reported by [@trackoor](https://github.com/trackoor))
- **Presolve dropped fixed variables from the objective** - A variable fixed by presolve (e.g. by `x = 1` plus a redundant row) had its cost zeroed, so the reported `result` missed `cost * value`. ([#176](https://github.com/JWally/jsLPSolver/pull/176))
- **Presolve reported feasible models with unrestricted variables as infeasible** - It assumed every variable without a recorded lower bound is non-negative. ([#188](https://github.com/JWally/jsLPSolver/pull/188))
- **Integer variables returned fractional when mixed with unrestricted variables** - The incumbent was rebuilt after the search and could stop at a different optimal vertex. ([#188](https://github.com/JWally/jsLPSolver/pull/188))

### Changed

- MIPs with several optimal solutions may return a different optimal vector than 1.0.3 (same objective value).
- Added a CI workflow and seeded property tests that check results against brute force.

## [1.0.3] - 2026-01-24

### Fixed

- **Variable-name objectives return zero** - When `optimize` names a variable directly (e.g., `optimize: "x"`) rather than a coefficient attribute, the solver now correctly assigns an implicit cost of 1 to that variable instead of producing a trivial zero objective. ([#121](https://github.com/JWally/jsLPSolver/issues/121), reported by [@Daniel-Alievsky](https://github.com/Daniel-Alievsky))
- **Solver hangs on degenerate LPs** - Both phases of the simplex could cycle indefinitely on problems with many redundant bound constraints (e.g., 300+ variables with explicit min/max bounds). Phase 1 now detects non-convergence and falls back to Bland's rule with lazy matrix save/restore; phase 2 detects stalled objectives and terminates degenerate cycling. ([#112](https://github.com/JWally/jsLPSolver/issues/112), reported by [@luke-thorburn](https://github.com/luke-thorburn))
- **Unrestricted variables with Big-M report false infeasibility** - Phase 1 of the simplex incorrectly treated negative-valued unrestricted basic variables as infeasibility violations, causing models with `unrestricted` variables and Big-M constraints (e.g., absolute value formulations `|x| >= C`) to return `feasible: false` or find suboptimal solutions. Phase 1 now skips unrestricted basic variables when checking feasibility and prefers entering columns that directly fix infeasibility. ([#130](https://github.com/JWally/jsLPSolver/issues/130), reported by [@robwieringa](https://github.com/robwieringa))

### Performance

- **B&B node pruning** - Branch-and-bound now prunes nodes whose LP relaxation bound equals the best known integer solution, avoiding unnecessary LP re-solves on provably non-improving nodes. ([#90](https://github.com/JWally/jsLPSolver/issues/90))

## [1.0.1] - 2026-01-12

### Performance

- **Pivot row caching** - Cache normalized pivot row values for better memory locality (15-30% simplex improvement)
- **Hash-based cycle detection** - Replace O(n²) algorithm with O(1) Map lookup (5-8% improvement when enabled)
- **Matrix over-allocation** - Reduce reallocation frequency during cut addition
- **Pre-computed inverse quotient** - Multiply instead of divide in inner loops

### Changed

- Updated README benchmarks with proper statistical methodology (10 runs, averaged)
- Added `useMIRCuts` option to API documentation

### Fixed

- Fixed pseudo-cost fractionality tracking in enhanced branch-and-cut
- Fixed lint warnings for unused variables

## [1.0.0] - 2026-01-05

### Breaking Changes

- **Full TypeScript rewrite** - The library is now written in TypeScript with full type definitions included
- **Build system changed** - Migrated from Grunt to Rollup for modern ESM/CJS dual packaging
- **Minimum Node.js version** - Now requires Node.js 16+ (for ESM support)

### Added

- Full TypeScript type definitions (`dist/index.d.ts`)
- ESM module support (`dist/index.mjs`) alongside CommonJS (`dist/index.cjs`)
- Browser-specific bundle (`dist/index.browser.mjs`)
- **Presolve module** - Automatic problem simplification before solving
- **Enhanced branch-and-cut** - New solver options for MIP problems:
    - `useMIRCuts` - Mixed Integer Rounding cuts
    - `useGomoryCuts` - Gomory fractional cuts
    - `presolve` - Enable/disable preprocessing
    - `timeout` - Time limit for solving
    - `tolerance` - Optimality gap tolerance
- **Solver options API** - Configure solver behavior via options object
- Vitest test suite with coverage reporting
- Security documentation (SECURITY.md)
- Input validation with warnings for common typos

### Changed

- Internal matrix representation uses `Float64Array` for better performance
- Branch-and-cut refactored into injectable service architecture
- Improved code organization with kebab-case file naming
- Source maps included for debugging

### Performance

- ~2-5x faster on large MIP problems due to:
    - Flat array matrix storage
    - Partial pricing in simplex
    - Presolve reductions
    - Sparse-aware pivot operations

### Fixed

- Various numerical stability improvements
- Better handling of degenerate pivots

### Removed

- Grunt build system
- Large static test data files (replaced with random problem generator)

## [0.4.24] - Previous Release

See git history for changes prior to 1.0.0
