# jsLPSolver

[![npm version](https://badge.fury.io/js/javascript-lp-solver.svg)](https://www.npmjs.com/package/javascript-lp-solver)
[![License: Unlicense](https://img.shields.io/badge/license-Unlicense-blue.svg)](http://unlicense.org/)

[A linear programming solver for the rest of us!](https://youtu.be/LbfMmCf5-ds?t=51)

## Features

- **Linear Programming (LP)**: Solve continuous optimization problems using the simplex algorithm
- **Mixed-Integer Programming (MIP)**: Handle integer and binary variables via branch-and-cut
- **Multi-Objective Optimization**: Find compromise solutions across multiple objectives
- **JSON Model Format**: Define problems as simple JavaScript objects
- **Zero Dependencies**: Pure JavaScript/TypeScript with no external solver required
- **Universal**: Works in Node.js, browsers, and Web Workers

## Installation

**Node.js:**

```bash
npm install javascript-lp-solver
```

**Browser (CDN):**

```html
<script src="https://unpkg.com/javascript-lp-solver/dist/solver.global.js"></script>
<script>
    // The solver is available as a global variable
    var model = {
        optimize: "profit",
        opType: "max",
        constraints: { capacity: { max: 100 } },
        variables: { x: { capacity: 10, profit: 5 } },
    };
    var result = solver.Solve(model);
    console.log(result); // { feasible: true, result: 50, x: 10 }
</script>
```

**ES Modules:**

```javascript
import solver from "javascript-lp-solver";
```

## Quick Start

Here's the classic [Berlin Airlift](http://math.stackexchange.com/questions/59429/berlin-airlift-linear-optimization-problem) problem:

> Maximize cargo capacity using American planes (30,000 cu ft, 16 personnel, $9,000/flight) and British planes (20,000 cu ft, 8 personnel, $5,000/flight), subject to: max 44 planes, max 512 personnel, max $300,000 weekly cost.

```javascript
const solver = require("javascript-lp-solver");

const model = {
    optimize: "capacity",
    opType: "max",
    constraints: {
        plane: { max: 44 },
        person: { max: 512 },
        cost: { max: 300000 },
    },
    variables: {
        brit: { capacity: 20000, plane: 1, person: 8, cost: 5000 },
        yank: { capacity: 30000, plane: 1, person: 16, cost: 9000 },
    },
};

const result = solver.Solve(model);
console.log(result);
// { feasible: true, result: 1080000, brit: 24, yank: 20 }
```

## Constraint Types

Constraints support three bound types:

```javascript
constraints: {
    resource_a: { max: 100 },      // resource_a <= 100
    resource_b: { min: 10 },       // resource_b >= 10
    resource_c: { equal: 50 },     // resource_c == 50
    resource_d: { min: 20, max: 80 }, // 20 <= resource_d <= 80
}
```

## Variable Bounds

By default, all variables are **non-negative** (≥ 0). This is standard LP solver behavior.

To allow negative values, use the `unrestricted` property:

```javascript
const model = {
    optimize: "profit",
    opType: "max",
    constraints: {
        balance: { equal: 0 },
    },
    variables: {
        income: { profit: 1, balance: 1 },
        expense: { profit: -1, balance: -1 },
    },
    unrestricted: { income: 1, expense: 1 }, // Allow negative values
};
```

To set upper bounds on variables, add them as single-variable constraints.
For integer programs the solver turns these (and the implicit `<= 1` of
`binaries`) into column bounds instead of tableau rows, so they cost almost
nothing:

```javascript
const model = {
    optimize: "output",
    opType: "max",
    constraints: {
        x_upper: { max: 100 }, // x <= 100
        y_upper: { max: 50 }, // y <= 50
    },
    variables: {
        x: { output: 10, x_upper: 1 },
        y: { output: 15, y_upper: 1 },
    },
};
```

## Integer Programming

Add `ints` or `binaries` to restrict variables to integer/binary values:

```javascript
const model = {
    optimize: "profit",
    opType: "max",
    constraints: {
        wood: { max: 300 },
        labor: { max: 110 },
    },
    variables: {
        table: { wood: 30, labor: 5, profit: 1200 },
        dresser: { wood: 20, labor: 10, profit: 1600 },
    },
    ints: { table: 1, dresser: 1 },
};

console.log(solver.Solve(model));
// { feasible: true, result: 14400, table: 8, dresser: 3 }
```

## Web Workers

For large problems, run the solver in a Web Worker to avoid blocking the UI:

```javascript
// worker.js
importScripts("https://unpkg.com/javascript-lp-solver/dist/solver.global.js");

onmessage = function (e) {
    postMessage(solver.Solve(e.data));
};
```

```javascript
// main.js
const worker = new Worker("worker.js");
worker.onmessage = (e) => console.log(e.data);
worker.postMessage(model);
```

## Performance

Measured on an Apple M4 Max, Node.js 24, median of repeated runs.
"v1.0.3" is the release before the 2026-10 solver work (see [LESSONS.md](./LESSONS.md)).

**Bundled problems** (`test/test-sanity`):

| Problem          | Variables | Constraints | Integers | v1.0.3  | Now     |
| ---------------- | --------- | ----------- | -------- | ------- | ------- |
| Vendor Selection | 1640      | 1641        | 40       | 154 ms  | 150 ms  |
| Monster II MIP   | 924       | 888         | 112      | 19.6 ms | 13.8 ms |
| Large Farm MIP\* | 100       | 35          | 100      | 18.8 ms | 12.0 ms |
| Monster LP       | 552       | 600         | 0        | 1.1 ms  | 1.2 ms  |
| Stock Cutting    | 31        | 5           | 31       | 0.74 ms | 0.08 ms |

\* Runs with `tolerance: 0.005`, so both versions stop at a solution within 0.5% of the bound.

The bundled problems are mostly too small to separate solvers, so the solver is
also benchmarked on classic public test sets (converted from MPS; optima
cross-checked with [HiGHS](https://highs.dev)), with a 30 s limit per problem:

| Test set              | v1.0.3                                            | Now                                  |
| --------------------- | ------------------------------------------------- | ------------------------------------ |
| 25 Netlib LPs         | 19 correct; 5 hang, 1 wrongly reported infeasible | **25 correct**                       |
| 30 MIPLIB 3 MIPs      | 9 solved                                          | **14 solved** (noswot also, in 76 s) |
| SPY option-spread MIP | did not finish in 120 s (wrong LP bound)          | **5.4 s**, verified optimal          |

| MIPLIB 3 instance                        | v1.0.3 | Now             | Speedup      |
| ---------------------------------------- | ------ | --------------- | ------------ |
| stein27                                  | 10.2 s | 0.14 s          | 72x          |
| p0201                                    | 26.1 s | 0.98 s          | 27x          |
| mod008                                   | 8.0 s  | 0.47 s          | 17x          |
| egout                                    | 13.4 s | 1.4 s           | 9x           |
| rgn                                      | 1.09 s | 0.22 s          | 5x           |
| lseu                                     | 6.4 s  | 1.7 s           | 4x           |
| khb05250                                 | 4.3 s  | 1.35 s          | 3x           |
| misc03, enigma, dcmulti, stein45, bell3a | > 30 s | 1.4 s to 12.4 s | newly solved |

What changed: a Harris ratio test and a robust phase 1 (fixing hangs and
wrong infeasible/unbounded verdicts), warm-started branch-and-bound nodes,
column bounds instead of constraint rows for branching and single-variable
constraints, objective-integrality pruning, and deterministic node selection.
Details, measurements and dead ends are in [LESSONS.md](./LESSONS.md).

## Documentation

For complete API documentation, see [API.md](./API.md).

Key options include:

- `timeout`: Maximum solve time in milliseconds
- `tolerance`: Accept solutions within X% of optimal (for faster MIP solving)
- `options.presolve`: Enable/disable problem preprocessing

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run stress tests (generated problems)
npm run test:stress

# Run linter
npm run lint

# Format code
npm run format

# Type check
npm run typecheck

# Build distribution
npm run build

# Generate API docs
npm run docs
```

### Testing

The test suite uses [Vitest](https://vitest.dev/) and includes:

- **Unit tests**: Cover utilities, data structures, and isolated components
- **Integration tests**: Run the solver against 47 real-world problems (Berlin Airlift, Knapsack, Farm MIP, etc.). MIP and feasibility models are verified (objective, feasibility, integrality) rather than pinned to one of several optimal solutions
- **Netlib regressions**: 11 classic LPs with HiGHS-verified optima (`test/netlib`), each solved in a child process with a timeout so a hang fails instead of freezing the run
- **Determinism**: solving without a `timeout` never reads the clock, so the same model always explores the same tree
- **Stress tests**: Use seeded random problem generation (LP, MIP, knapsack, set cover, transportation) to test solver robustness without large static test files

Coverage thresholds are enforced: 60% statements/lines/functions, 45% branches.

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

[Unlicense](http://unlicense.org/) - Public Domain
