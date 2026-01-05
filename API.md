# jsLPSolver API Documentation

This document describes the JSON model format and solver options for jsLPSolver.

## Table of Contents

- [Model Structure](#model-structure)
- [Basic Properties](#basic-properties)
- [Variables](#variables)
- [Constraints](#constraints)
- [Integer and Binary Variables](#integer-and-binary-variables)
- [Solver Options](#solver-options)
- [Multi-Objective Optimization](#multi-objective-optimization)
- [External Solver Integration](#external-solver-integration)
- [Solution Format](#solution-format)

## Model Structure

A jsLPSolver model is a plain JavaScript object with the following structure:

```typescript
interface Model {
    optimize: string | Record<string, "max" | "min">;
    opType?: "max" | "min";
    constraints: Record<string, ConstraintBound>;
    variables: Record<string, VariableCoefficients>;
    ints?: Record<string, boolean | 0 | 1>;
    binaries?: Record<string, boolean | 0 | 1>;
    unrestricted?: Record<string, boolean | 0 | 1>;
    options?: SolveOptions;
}
```

## Basic Properties

### `optimize`

Specifies what to optimize. This is typically an attribute name that appears in your variables:

```javascript
{
    optimize: "profit",
    opType: "max"
}
```

For multi-objective optimization, use an object:

```javascript
{
    optimize: {
        profit: "max",
        risk: "min"
    }
}
```

### `opType`

The optimization direction: `"max"` (maximize) or `"min"` (minimize).

## Variables

Variables are the decision variables of your problem. Each variable is an object mapping attribute names to coefficients:

```javascript
variables: {
    table: {
        wood: 30,      // Uses 30 units of wood
        labor: 5,      // Requires 5 hours of labor
        profit: 1200   // Generates $1,200 profit
    },
    dresser: {
        wood: 20,
        labor: 10,
        profit: 1600
    }
}
```

The attribute names connect to constraints and the objective. In this example:

- `wood` and `labor` are constrained resources
- `profit` is the objective to maximize

## Constraints

Constraints limit the values of expressions. Each constraint specifies bounds on an attribute:

```javascript
constraints: {
    wood: { max: 300 },           // At most 300 units of wood
    labor: { min: 10, max: 110 }, // Between 10 and 110 labor hours
    budget: { equal: 1000 }       // Exactly 1000 budget
}
```

### Constraint Properties

| Property   | Description                                                                      |
| ---------- | -------------------------------------------------------------------------------- |
| `max`      | Upper bound (less than or equal)                                                 |
| `min`      | Lower bound (greater than or equal)                                              |
| `equal`    | Equality constraint                                                              |
| `weight`   | Relaxation weight for soft constraints                                           |
| `priority` | Relaxation priority: `"required"`, `"strong"`, `"medium"`, `"weak"`, or a number |

### Soft Constraints

Constraints can be relaxed by specifying a weight or priority:

```javascript
constraints: {
    budget: { max: 1000, weight: 100 }  // Prefer to stay under budget
}
```

## Integer and Binary Variables

### Integer Variables (`ints`)

Restrict variables to integer values:

```javascript
{
    variables: { x: {...}, y: {...} },
    ints: { x: 1, y: 1 }
}
```

### Binary Variables (`binaries`)

Restrict variables to 0 or 1:

```javascript
{
    variables: { use_a: {...}, use_b: {...} },
    binaries: { use_a: 1, use_b: 1 }
}
```

### Unrestricted Variables (`unrestricted`)

Allow variables to be negative (default is non-negative):

```javascript
{
    variables: { delta: {...} },
    unrestricted: { delta: 1 }
}
```

## Solver Options

Options can be specified at the model level or in an `options` object:

```javascript
{
    // Top-level options
    timeout: 10000,
    tolerance: 0.05,

    // Or in options object
    options: {
        timeout: 10000,
        tolerance: 0.05,
        exitOnCycles: true,
        presolve: true
    }
}
```

### Available Options

| Option           | Default        | Description                                                         |
| ---------------- | -------------- | ------------------------------------------------------------------- |
| `timeout`        | none           | Maximum solve time in milliseconds (MIP only)                       |
| `tolerance`      | 0              | Accept solutions within X% of optimal (e.g., 0.05 = 5%)             |
| `exitOnCycles`   | true           | Stop if cycling is detected in simplex                              |
| `presolve`       | true           | Apply preprocessing to reduce problem size                          |
| `keep_solutions` | false          | Store intermediate MIP solutions                                    |
| `nodeSelection`  | `"hybrid"`     | B&B node selection: `"best-first"`, `"depth-first"`, `"hybrid"`     |
| `branching`      | `"pseudocost"` | Variable selection: `"most-fractional"`, `"pseudocost"`, `"strong"` |

### Timeout

Limits solving time for difficult MIP problems:

```javascript
options: {
    timeout: 10000; // 10 seconds
}
```

### Tolerance

Accept near-optimal solutions faster:

```javascript
options: {
    tolerance: 0.05; // Accept solutions within 5% of optimal
}
```

## Multi-Objective Optimization

Optimize multiple objectives simultaneously:

```javascript
const model = {
    optimize: {
        profit: "max",
        risk: "min",
        time: "min"
    },
    constraints: {...},
    variables: {...}
};

const result = solver.MultiObjective(model);
// Returns: { midpoint, vertices, ranges }
```

The solver finds Pareto-optimal solutions for each objective, then returns a compromise solution at the midpoint.

## External Solver Integration

Delegate to external solvers like lp_solve for potentially better performance:

```javascript
{
    optimize: "profit",
    opType: "max",
    constraints: {...},
    variables: {...},
    external: {
        solver: "lpsolve",
        binPath: "/usr/bin/lp_solve",
        tempName: "/tmp/model.lp",
        args: ["-s2", "-timeout", "240"]
    }
}
```

**Note:** External solvers require Node.js and are not available in browsers.

### lp_solve Options

| Property   | Description                          |
| ---------- | ------------------------------------ |
| `solver`   | Must be `"lpsolve"`                  |
| `binPath`  | Path to lp_solve executable          |
| `tempName` | Temporary file path for the LP model |
| `args`     | Command-line arguments for lp_solve  |

## Solution Format

The solver returns an object with the solution:

```javascript
{
    feasible: true,      // Whether a feasible solution was found
    result: 14400,       // Objective function value
    bounded: true,       // Whether the problem is bounded
    isIntegral: true,    // Whether all integer constraints are satisfied

    // Variable values (non-zero only)
    table: 8,
    dresser: 3
}
```

### Solution Properties

| Property     | Type    | Description                                   |
| ------------ | ------- | --------------------------------------------- |
| `feasible`   | boolean | True if a feasible solution exists            |
| `result`     | number  | Optimal objective value                       |
| `bounded`    | boolean | True if the problem is bounded                |
| `isIntegral` | boolean | True if integer constraints are satisfied     |
| `[variable]` | number  | Value of each variable (non-zero values only) |

### Infeasible Problems

If no feasible solution exists:

```javascript
{
    feasible: false,
    result: 0,
    bounded: true
}
```

### Unbounded Problems

If the objective can be improved infinitely:

```javascript
{
    feasible: true,
    result: Infinity,  // or -Infinity for minimization
    bounded: false
}
```

## TypeScript Support

Full TypeScript definitions are included. Import types as needed:

```typescript
import solver, { Model, SolveResult, SolveOptions } from "javascript-lp-solver";

const model: Model = {
    optimize: "profit",
    opType: "max",
    constraints: { budget: { max: 1000 } },
    variables: { x: { budget: 100, profit: 50 } },
};

const result: SolveResult = solver.Solve(model);
```
