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

Measured on an Apple M4 Max, Node.js 24. "v1.0.3" is the release before the
2026-10 solver work; "#169" is master after the first round (PRs #168, #169);
"#170" adds the second round; "Now" adds the third (c-MIR cuts; see
[LESSONS.md](./LESSONS.md)). The reference
is [HiGHS](https://highs.dev) compiled to WebAssembly (the npm `highs`
package, single thread), the strongest solver that runs in the same place.

**Bundled problems** (`test/test-sanity`, median of repeated runs):

| Problem          | Variables | Constraints | Integers | v1.0.3  | #169    | #170    | Now     |
| ---------------- | --------- | ----------- | -------- | ------- | ------- | ------- | ------- |
| Vendor Selection | 1640      | 1641        | 40       | 155 ms  | 156 ms  | 348 ms  | 362 ms  |
| Monster II MIP   | 924       | 888         | 112      | 19.8 ms | 11.3 ms | 4.0 ms  | 5.2 ms  |
| Large Farm MIP\* | 100       | 35          | 100      | 19.2 ms | 11.7 ms | 2.0 ms  | 2.1 ms  |
| Knapsack 1       | 50        | 1           | 50       | -       | 0.45 ms | 0.17 ms | 0.17 ms |
| Monster LP       | 552       | 600         | 0        | 1.0 ms  | 1.1 ms  | 1.1 ms  | 1.0 ms  |
| Stock Cutting    | 31        | 5           | 31       | 0.72 ms | 0.05 ms | 0.08 ms | 0.08 ms |

\* Runs with `tolerance: 0.005`, so every version stops at a solution within 0.5% of the bound.

**Classic test sets** (converted from MPS, 30 s limit per problem). A problem
counts as solved only if the returned solution vector is feasible, integral
and optimal when recomputed independently with HiGHS:

| Test set              | v1.0.3                                  | #169                             | #170       | Now            |
| --------------------- | --------------------------------------- | -------------------------------- | ---------- | -------------- |
| 25 Netlib LPs         | 19 correct (5 hang, 1 false infeasible) | 25 correct                       | 25 correct | **25 correct** |
| 30 MIPLIB 3 MIPs      | 9 solved                                | 12 solved (2 more wrong vectors) | 21 solved  | **23 solved**  |
| ... within 60 s       |                                         |                                  | 23 solved  | **27 solved**  |
| SPY option-spread MIP | did not finish in 120 s                 | 5.4 s                            | 2.3 s      | **0.4 s**      |
| 4 soccer rotations    | none finish in 60 s                     | none finish in 60 s              | 0.2-2.2 s  | **0.2-2.4 s**  |

The first round's README also listed MIPLIB noswot as solved; that answer was
wrong (its vector recomputes to -19 with violated rows, while HiGHS proves -41).

| MIPLIB 3 instance | v1.0.3 | #169   | #170   | Now    | HiGHS-WASM |
| ----------------- | ------ | ------ | ------ | ------ | ---------- |
| stein27           | 10.8 s | 0.1 s  | 0.1 s  | 0.1 s  | 0.43 s     |
| p0201             | 26.6 s | wrong  | 0.5 s  | 0.5 s  | 0.52 s     |
| mod008            | 8.0 s  | 0.5 s  | 0.2 s  | 0.2 s  | 0.71 s     |
| egout             | 13.8 s | 1.7 s  | 0.03 s | 0.03 s | 0.06 s     |
| lseu              | 7.0 s  | 1.8 s  | 0.2 s  | 0.1 s  | 0.16 s     |
| khb05250          | 4.8 s  | 1.6 s  | 0.2 s  | 0.2 s  | 0.26 s     |
| bell3a            | > 30 s | 10.2 s | 0.8 s  | 1.3 s  | 0.58 s     |
| dcmulti           | > 30 s | 11.7 s | 1.7 s  | 2.5 s  | 1.13 s     |
| enigma            | > 30 s | wrong  | 1.9 s  | 2.0 s  | 0.31 s     |
| bell5             | > 30 s | > 30 s | 3.1 s  | 2.6 s  | 0.29 s     |
| fixnet6           | > 30 s | > 30 s | 3.5 s  | 4.2 s  | 1.66 s     |
| p0548             | > 30 s | > 30 s | 5.5 s  | 2.0 s  | 0.12 s     |
| gesa2             | > 30 s | > 30 s | > 30 s | 9.4 s  | 0.42 s     |
| blend2            | > 30 s | > 30 s | > 30 s | 12.7 s | 1.08 s     |
| mas76             | > 30 s | > 30 s | 9.6 s  | 9.6 s  | > 120 s    |
| 60 s limit:       |        |        |        |        |            |
| mod010            | > 60 s | > 60 s | > 60 s | 31 s   | 0.48 s     |
| fiber             | > 60 s | > 60 s | > 60 s | 49 s   | 0.69 s     |
| misc07            | > 60 s | > 60 s | 48 s   | 49 s   | 17.0 s     |
| pk1               | > 60 s | > 60 s | 54 s   | 56 s   | > 120 s    |

Still out of reach: noswot, qnet1 and vpm2 (HiGHS-WASM: noswot 52 s, the
others 0.4-1.3 s).

What changed in the third round: root c-MIR cuts on the original rows
(Marchand-Wolsey, with variable-upper-bound substitution and refinements
following HiGHS's separator), whose cuts are checked against sampled
feasible points in the tests.

What changed in the second round: LP numerics (a Harris dual ratio test,
consistent tolerances, row equilibration), Devex pricing, reliability
branching, root Gomory cuts, root presolve (bound propagation and big-M
coefficient tightening), reduced-cost fixing, implied-integer detection and
objective integrality by total unimodularity. Details, measurements and dead
ends are in [LESSONS.md](./LESSONS.md).

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
