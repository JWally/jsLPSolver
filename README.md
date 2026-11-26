# jsLPSolver

[![npm version](https://badge.fury.io/js/javascript-lp-solver.svg)](https://www.npmjs.com/package/javascript-lp-solver)
[![License: Unlicense](https://img.shields.io/badge/license-Unlicense-blue.svg)](http://unlicense.org/)

[A linear programming solver for the rest of us!](https://youtu.be/LbfMmCf5-ds?t=51)

## Features

- **Linear Programming (LP)**: Solve continuous optimization problems using the simplex algorithm
- **Mixed-Integer Programming (MIP)**: Handle integer and binary variables via branch-and-cut
- **Multi-Objective Optimization**: Find compromise solutions across multiple objectives
- **JSON Model Format**: Define problems as simple JavaScript objects
- **Zero Dependencies**: Pure JavaScript/TypeScript with no external solver required (a small embedded WebAssembly SIMD kernel speeds up pivots where available, with a JS fallback)
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

Measured on an Apple M4 Max, Node.js 24, single thread. "v1.0.3" is the
previous release; "1.1.0" is the current one (mod010, p0282, p0548 and lseu are
measured on master, after the root cut probe and cover cuts). The reference is
[HiGHS](https://highs.dev) compiled to WebAssembly (the npm `highs` package,
version 1.16.0, single thread), the strongest solver that runs in the same
place. How each step was reached, including what was tried and dropped, is in
[LESSONS.md](./LESSONS.md).

**Bundled problems** (`test/test-sanity`, median of repeated warm runs):

| Problem          | Variables | Constraints | Integers | v1.0.3  | 1.1.0   |
| ---------------- | --------- | ----------- | -------- | ------- | ------- |
| Vendor Selection | 1640      | 1641        | 40       | 155 ms  | 211 ms  |
| Monster II MIP   | 924       | 888         | 112      | 19.8 ms | 4.7 ms  |
| Large Farm MIP\* | 100       | 35          | 100      | 19.2 ms | 1.2 ms  |
| Knapsack 1       | 50        | 1           | 50       | -       | 0.16 ms |
| Monster LP       | 552       | 600         | 0        | 1.0 ms  | 0.95 ms |
| Stock Cutting    | 31        | 5           | 31       | 0.72 ms | 0.09 ms |

\* Runs with `tolerance: 0.005`, so every version stops at a solution within 0.5% of the bound.

Vendor Selection is the one bundled problem that is slower than in v1.0.3;
its history is in [LESSONS.md](./LESSONS.md).

**Classic test sets** (converted from MPS). A MIP counts as solved only if
the returned solution vector is feasible and integral when checked against
the model and its objective equals the optimum HiGHS proves:

| Test set                     | v1.0.3                                  | 1.1.0          |
| ---------------------------- | --------------------------------------- | -------------- |
| 25 Netlib LPs                | 19 correct (5 hang, 1 false infeasible) | **25 correct** |
| 30 MIPLIB 3 MIPs, 30 s limit | 9 solved                                | **27 solved**  |
| ... 60 s limit               |                                         | **28 solved**  |
| SPY option-spread MIP        | did not finish in 120 s                 | **0.25 s**     |

Not solved in 60 s: noswot and vpm2 (HiGHS-WASM: 16 s and 1.0 s).

Time per MIPLIB 3 instance, one run each. The last column is 1.1.0 time
divided by HiGHS-WASM time, so below 1 means jsLPSolver is faster:

| Instance | v1.0.3 | 1.1.0  | HiGHS-WASM | ratio |
| -------- | ------ | ------ | ---------- | ----- |
| mas76    | > 30 s | 3.4 s  | 59.9 s     | 0.06  |
| stein45  | -      | 1.7 s  | 13.8 s     | 0.12  |
| stein27  | 10.8 s | 0.05 s | 0.29 s     | 0.16  |
| pk1      | > 60 s | 19.5 s | 107 s      | 0.18  |
| mod008   | 8.0 s  | 0.11 s | 0.63 s     | 0.18  |
| p0201    | 26.6 s | 0.16 s | 0.84 s     | 0.19  |
| flugpl   | -      | 0.02 s | 0.09 s     | 0.23  |
| lseu     | 7.0 s  | 0.07 s | 0.23 s     | 0.32  |
| p0033    | -      | 0.02 s | 0.06 s     | 0.26  |
| mod010   | > 60 s | 0.22 s | 0.58 s     | 0.38  |
| rgn      | -      | 0.09 s | 0.21 s     | 0.40  |
| gt2      | -      | 0.03 s | 0.08 s     | 0.41  |
| p0282    | -      | 0.08 s | 0.19 s     | 0.43  |
| egout    | 13.8 s | 0.03 s | 0.06 s     | 0.46  |
| khb05250 | 4.8 s  | 0.13 s | 0.26 s     | 0.51  |
| dcmulti  | > 30 s | 0.75 s | 1.36 s     | 0.55  |
| misc03   | -      | 0.22 s | 0.36 s     | 0.61  |
| misc07   | > 60 s | 11.9 s | 17.4 s     | 0.68  |
| fixnet6  | > 30 s | 1.5 s  | 1.8 s      | 0.86  |
| vpm1     | -      | 0.09 s | 0.08 s     | 1.1   |
| bell3a   | > 30 s | 0.56 s | 0.23 s     | 2.4   |
| p0548    | > 30 s | 0.47 s | 0.13 s     | 3.6   |
| blend2   | > 30 s | 4.9 s  | 1.3 s      | 3.8   |
| bell5    | > 30 s | 1.4 s  | 0.32 s     | 4.3   |
| enigma   | > 30 s | 0.75 s | 0.10 s     | 7.2   |
| gesa2    | > 30 s | 7.3 s  | 0.43 s     | 17    |
| fiber    | > 60 s | 15.4 s | 0.61 s     | 25    |
| qnet1    | > 60 s | 52.3 s | 0.47 s     | 111   |
| vpm2     | > 60 s | > 60 s | 1.0 s      | -     |
| noswot   | > 60 s | > 60 s | 16.0 s     | -     |

"-" under v1.0.3 means it was not measured for that release. jsLPSolver is
ahead on 19 of the 28 instances both solve, mostly small models and ones with
large search trees; HiGHS is far ahead on qnet1, fiber and gesa2. The Netlib LPs
solve in 2-53 ms.

What changed since v1.0.3: a bounded dual simplex with warm-started,
deterministic branch and bound; LP numerics (Harris ratio tests, row
equilibration, Devex pricing); reliability branching; root presolve, Gomory
and c-MIR cuts; reduced-cost fixing; and a WebAssembly SIMD kernel for the
pivot, with a JS fallback.

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
