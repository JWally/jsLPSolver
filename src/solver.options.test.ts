/**
 * Integration tests for solver options
 *
 * Tests the various configuration options that can be passed to the solver:
 * - timeout: Maximum solve time
 * - tolerance: Accept sub-optimal solutions within X%
 * - exitOnCycles: Cycle detection behavior
 * - useMIRCuts: Mixed-integer rounding cuts
 * - nodeSelection: Branch-and-bound node selection strategy
 * - branching: Variable branching strategy
 */
import { describe, it, expect } from "vitest";
import solver from "./solver";
import type { Model } from "./types/solver";

/**
 * Creates a MIP problem that takes a non-trivial amount of time to solve.
 * Used for testing timeout and tolerance options.
 */
function createSlowMIP(size: number): Model {
    const variables: Record<string, Record<string, number>> = {};
    const ints: Record<string, number> = {};

    for (let i = 0; i < size; i++) {
        variables[`x${i}`] = {
            objective: Math.floor(Math.random() * 100) + 1,
            capacity: Math.floor(Math.random() * 20) + 1,
        };
        ints[`x${i}`] = 1;
    }

    return {
        optimize: "objective",
        opType: "max",
        constraints: {
            capacity: { max: size * 5 },
        },
        variables,
        ints,
    };
}

describe("Solver Options", () => {
    describe("timeout", () => {
        it("respects timeout and returns best solution found", () => {
            // Create a problem that would take a while to solve optimally
            const model: Model = {
                ...createSlowMIP(30),
                timeout: 100, // 100ms timeout
            };

            const startTime = Date.now();
            const result = solver.Solve(model);
            const elapsed = Date.now() - startTime;

            // Should return within reasonable time of timeout
            expect(elapsed).toBeLessThan(500); // Allow some overhead
            // Should still return a result (possibly suboptimal)
            expect(result).toBeDefined();
            expect(typeof result.feasible).toBe("boolean");
        });

        it("solves quickly when timeout is not needed", () => {
            const model: Model = {
                optimize: "profit",
                opType: "max",
                constraints: {
                    capacity: { max: 10 },
                },
                variables: {
                    x: { profit: 5, capacity: 2 },
                },
                ints: { x: 1 },
                timeout: 5000,
            };

            const startTime = Date.now();
            const result = solver.Solve(model);
            const elapsed = Date.now() - startTime;

            expect(elapsed).toBeLessThan(100); // Should solve quickly
            expect(result.feasible).toBe(true);
            expect(result.x).toBe(5);
        });
    });

    describe("tolerance", () => {
        it("accepts sub-optimal solution within tolerance", () => {
            // A problem where we know the optimal value
            const model: Model = {
                optimize: "profit",
                opType: "max",
                constraints: {
                    budget: { max: 100 },
                },
                variables: {
                    a: { profit: 10, budget: 10 },
                    b: { profit: 15, budget: 15 },
                    c: { profit: 20, budget: 20 },
                },
                ints: { a: 1, b: 1, c: 1 },
                tolerance: 0.1, // Accept within 10% of optimal
            };

            const result = solver.Solve(model);

            expect(result.feasible).toBe(true);
            // Optimal is 100 (10*10), tolerance allows >= 90
            expect(result.result).toBeGreaterThanOrEqual(90);
        });

        it("finds optimal when tolerance is 0", () => {
            const model: Model = {
                optimize: "profit",
                opType: "max",
                constraints: {
                    budget: { max: 100 },
                },
                variables: {
                    a: { profit: 10, budget: 10 },
                    b: { profit: 8, budget: 10 },
                },
                ints: { a: 1, b: 1 },
                tolerance: 0,
            };

            const result = solver.Solve(model);

            expect(result.feasible).toBe(true);
            expect(result.result).toBe(100); // Optimal: 10 units of a
        });
    });

    describe("options.nodeSelection", () => {
        const baseModel: Model = {
            optimize: "profit",
            opType: "max",
            constraints: {
                capacity: { max: 50 },
                labor: { max: 40 },
            },
            variables: {
                table: { profit: 12, capacity: 3, labor: 5 },
                chair: { profit: 8, capacity: 2, labor: 3 },
            },
            ints: { table: 1, chair: 1 },
        };

        it("solves with best-first node selection", () => {
            const model: Model = {
                ...baseModel,
                options: { nodeSelection: "best-first" },
            };

            const result = solver.Solve(model);

            expect(result.feasible).toBe(true);
            expect(result.result).toBeGreaterThan(0);
        });

        it("solves with depth-first node selection", () => {
            const model: Model = {
                ...baseModel,
                options: { nodeSelection: "depth-first" },
            };

            const result = solver.Solve(model);

            expect(result.feasible).toBe(true);
            expect(result.result).toBeGreaterThan(0);
        });

        it("solves with hybrid node selection", () => {
            const model: Model = {
                ...baseModel,
                options: { nodeSelection: "hybrid" },
            };

            const result = solver.Solve(model);

            expect(result.feasible).toBe(true);
            expect(result.result).toBeGreaterThan(0);
        });

        it("all strategies produce same optimal result", () => {
            const strategies = ["best-first", "depth-first", "hybrid"] as const;
            const results = strategies.map((nodeSelection) => {
                const model: Model = { ...baseModel, options: { nodeSelection } };
                return solver.Solve(model);
            });

            // All should find the same optimal value
            expect(results[0].result).toBe(results[1].result);
            expect(results[1].result).toBe(results[2].result);
        });
    });

    describe("options.branching", () => {
        const baseModel: Model = {
            optimize: "value",
            opType: "max",
            constraints: {
                weight: { max: 100 },
            },
            variables: {
                item1: { value: 60, weight: 10 },
                item2: { value: 100, weight: 20 },
                item3: { value: 120, weight: 30 },
            },
            ints: { item1: 1, item2: 1, item3: 1 },
        };

        it("solves with most-fractional branching", () => {
            const model: Model = {
                ...baseModel,
                options: { branching: "most-fractional" },
            };

            const result = solver.Solve(model);

            expect(result.feasible).toBe(true);
        });

        it("solves with pseudocost branching", () => {
            const model: Model = {
                ...baseModel,
                options: { branching: "pseudocost" },
            };

            const result = solver.Solve(model);

            expect(result.feasible).toBe(true);
        });

        it("solves with strong branching", () => {
            const model: Model = {
                ...baseModel,
                options: { branching: "strong" },
            };

            const result = solver.Solve(model);

            expect(result.feasible).toBe(true);
        });
    });

    describe("options.useMIRCuts", () => {
        it("solves with MIR cuts enabled", () => {
            const model: Model = {
                optimize: "profit",
                opType: "max",
                constraints: {
                    resource: { max: 100 },
                },
                variables: {
                    x: { profit: 10, resource: 7 },
                    y: { profit: 15, resource: 11 },
                },
                ints: { x: 1, y: 1 },
                options: { useMIRCuts: true },
            };

            const result = solver.Solve(model);

            expect(result.feasible).toBe(true);
            expect(result.result).toBeGreaterThan(0);
        });

        it("solves with MIR cuts disabled", () => {
            const model: Model = {
                optimize: "profit",
                opType: "max",
                constraints: {
                    resource: { max: 100 },
                },
                variables: {
                    x: { profit: 10, resource: 7 },
                    y: { profit: 15, resource: 11 },
                },
                ints: { x: 1, y: 1 },
                options: { useMIRCuts: false },
            };

            const result = solver.Solve(model);

            expect(result.feasible).toBe(true);
        });
    });

    describe("options.useIncremental", () => {
        const model: Model = {
            optimize: "profit",
            opType: "max",
            constraints: {
                capacity: { max: 30 },
            },
            variables: {
                a: { profit: 5, capacity: 3 },
                b: { profit: 7, capacity: 4 },
                c: { profit: 3, capacity: 2 },
            },
            ints: { a: 1, b: 1, c: 1 },
        };

        it("solves with incremental B&B enabled", () => {
            const result = solver.Solve({
                ...model,
                options: { useIncremental: true },
            });

            expect(result.feasible).toBe(true);
            expect(result.result).toBeGreaterThan(0);
        });

        it("solves with incremental B&B disabled", () => {
            const result = solver.Solve({
                ...model,
                options: { useIncremental: false },
            });

            expect(result.feasible).toBe(true);
            expect(result.result).toBeGreaterThan(0);
        });

        it("both modes produce same result", () => {
            const resultIncremental = solver.Solve({
                ...model,
                options: { useIncremental: true },
            });
            const resultStandard = solver.Solve({
                ...model,
                options: { useIncremental: false },
            });

            expect(resultIncremental.result).toBe(resultStandard.result);
        });
    });

    describe("combined options", () => {
        it("handles multiple options together", () => {
            const model: Model = {
                optimize: "profit",
                opType: "max",
                constraints: {
                    budget: { max: 50 },
                    time: { max: 40 },
                },
                variables: {
                    project1: { profit: 100, budget: 10, time: 8 },
                    project2: { profit: 150, budget: 15, time: 12 },
                    project3: { profit: 80, budget: 8, time: 6 },
                },
                ints: { project1: 1, project2: 1, project3: 1 },
                timeout: 5000,
                tolerance: 0.05,
                options: {
                    nodeSelection: "hybrid",
                    branching: "pseudocost",
                    useMIRCuts: true,
                },
            };

            const result = solver.Solve(model);

            expect(result.feasible).toBe(true);
            expect(result.result).toBeGreaterThan(0);
        });
    });
});

describe("LP Options (non-MIP)", () => {
    describe("basic LP solving", () => {
        it("solves LP without integer constraints", () => {
            const model: Model = {
                optimize: "profit",
                opType: "max",
                constraints: {
                    labor: { max: 100 },
                    materials: { max: 80 },
                },
                variables: {
                    productA: { profit: 20, labor: 2, materials: 3 },
                    productB: { profit: 30, labor: 3, materials: 2 },
                },
            };

            const result = solver.Solve(model);

            expect(result.feasible).toBe(true);
            expect(result.result).toBeGreaterThan(0);
            // At least one product should be produced (zero values are omitted from result)
            const hasProduct = result.productA !== undefined || result.productB !== undefined;
            expect(hasProduct).toBe(true);
        });
    });
});

describe("Edge Cases", () => {
    it("handles infeasible problem", () => {
        const model: Model = {
            optimize: "profit",
            opType: "max",
            constraints: {
                min_production: { min: 100 },
                max_capacity: { max: 50 }, // Contradiction
            },
            variables: {
                x: { profit: 10, min_production: 1, max_capacity: 1 },
            },
        };

        const result = solver.Solve(model);

        expect(result.feasible).toBe(false);
    });

    it("handles unbounded problem", () => {
        const model: Model = {
            optimize: "profit",
            opType: "max",
            constraints: {
                // No upper bound on profit-generating variable
                resource: { min: 0 },
            },
            variables: {
                x: { profit: 10, resource: 1 },
            },
        };

        const result = solver.Solve(model);

        // Should either be unbounded or find a solution
        expect(result).toBeDefined();
    });

    it("handles empty variables", () => {
        const model: Model = {
            optimize: "profit",
            opType: "max",
            constraints: {},
            variables: {},
        };

        const result = solver.Solve(model);

        expect(result.feasible).toBe(true);
        // Result can be 0 or -0, both are valid
        expect(result.result === 0 || Object.is(result.result, -0)).toBe(true);
    });
});
