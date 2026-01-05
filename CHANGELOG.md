# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
