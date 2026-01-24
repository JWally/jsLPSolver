# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
