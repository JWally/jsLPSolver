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
        variables: { x: { capacity: 10, profit: 5 } }
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

To set upper bounds on variables, add them as constraints:

```javascript
const model = {
    optimize: "output",
    opType: "max",
    constraints: {
        x_upper: { max: 100 }, // x <= 100
        y_upper: { max: 50 },  // y <= 50
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

Representative benchmarks on a modern laptop:

| Problem          | Variables | Constraints | Integers | Time  |
| ---------------- | --------- | ----------- | -------- | ----- |
| Large Farm MIP   | 100       | 35          | 100      | 16ms  |
| Monster LP       | 552       | 600         | 0        | 18ms  |
| Monster II MIP   | 924       | 888         | 112      | 308ms |
| Stock Cutting    | 31        | 5           | 31       | 1.4ms |
| Vendor Selection | 1640      | 1641        | 0        | 1.2s  |

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
- **Integration tests**: Run the solver against 47 real-world problems (Berlin Airlift, Knapsack, Farm MIP, etc.)
- **Stress tests**: Use seeded random problem generation (LP, MIP, knapsack, set cover, transportation) to test solver robustness without large static test files

Coverage thresholds are enforced: 60% statements/lines/functions, 45% branches.

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

[Unlicense](http://unlicense.org/) - Public Domain
