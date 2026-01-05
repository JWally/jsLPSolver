import { describe, it, expect, vi } from "vitest";
import Polyopt from "./polyopt";
import type { Model as ModelDefinition } from "./types/solver";

/**
 * Creates a mock solver for testing Polyopt.
 */
function createMockSolver(solutions: Record<string, unknown>[]) {
    let callIndex = 0;
    return {
        Solve: vi.fn().mockImplementation(() => {
            const solution = solutions[callIndex] ?? solutions[solutions.length - 1];
            callIndex++;
            return solution;
        }),
    };
}

describe("Polyopt", () => {
    describe("basic functionality", () => {
        it("throws error when no objectives defined", () => {
            const solver = createMockSolver([{}]);
            const model: ModelDefinition = {
                optimize: {},
                opType: "max",
                constraints: {},
                variables: {},
            };

            expect(() => Polyopt(solver, model)).toThrow(
                "Multi-objective solve requires at least one objective definition"
            );
        });

        it("solves single objective model", () => {
            const solver = createMockSolver([
                { feasible: true, result: 10, x: 5, profit: 10 },
                { feasible: true, result: 10, x: 5, profit: 10 },
            ]);

            const model: ModelDefinition = {
                optimize: { profit: "max" },
                opType: "max",
                constraints: {},
                variables: {
                    x: { profit: 2 },
                },
            };

            const result = Polyopt(solver, model);

            expect(result.midpoint).toBeDefined();
            expect(result.vertices).toHaveLength(1);
            expect(result.ranges).toBeDefined();
        });

        it("solves multi-objective model", () => {
            const solver = createMockSolver([
                { feasible: true, result: 100, x: 10, profit: 100, efficiency: 0.5 },
                { feasible: true, result: 0.9, x: 5, profit: 50, efficiency: 0.9 },
                { feasible: true, result: 75, x: 7.5, profit: 75, efficiency: 0.7 },
            ]);

            const model: ModelDefinition = {
                optimize: {
                    profit: "max",
                    efficiency: "max",
                },
                opType: "max",
                constraints: {},
                variables: {
                    x: { profit: 10, efficiency: 0.1 },
                },
            };

            const result = Polyopt(solver, model);

            expect(result.midpoint).toBeDefined();
            expect(result.vertices.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe("Pareto vertices", () => {
        it("collects unique Pareto vertices", () => {
            const solver = createMockSolver([
                { feasible: true, result: 100, x: 10, obj1: 100, obj2: 50 },
                { feasible: true, result: 80, x: 8, obj1: 80, obj2: 80 },
                { feasible: true, result: 90, x: 9 }, // midpoint solve
            ]);

            const model: ModelDefinition = {
                optimize: {
                    obj1: "max",
                    obj2: "max",
                },
                opType: "max",
                constraints: {},
                variables: {
                    x: { obj1: 10, obj2: 5 },
                },
            };

            const result = Polyopt(solver, model);

            expect(result.vertices.length).toBe(2);
        });

        it("deduplicates identical vertices", () => {
            const solver = createMockSolver([
                { feasible: true, result: 100, x: 10, obj1: 100, obj2: 50 },
                { feasible: true, result: 100, x: 10, obj1: 100, obj2: 50 }, // Same vertex
                { feasible: true, result: 100, x: 10 }, // midpoint
            ]);

            const model: ModelDefinition = {
                optimize: {
                    obj1: "max",
                    obj2: "max",
                },
                opType: "max",
                constraints: {},
                variables: {
                    x: { obj1: 10, obj2: 5 },
                },
            };

            const result = Polyopt(solver, model);

            // Should only have 1 unique vertex
            expect(result.vertices.length).toBe(1);
        });

        it("strips metadata from vertices", () => {
            const solver = createMockSolver([
                { feasible: true, result: 100, bounded: true, x: 10, profit: 100 },
                { feasible: true, result: 100, x: 10, profit: 100 },
            ]);

            const model: ModelDefinition = {
                optimize: { profit: "max" },
                opType: "max",
                constraints: {},
                variables: { x: { profit: 10 } },
            };

            const result = Polyopt(solver, model);

            const vertex = result.vertices[0];
            expect(vertex.feasible).toBeUndefined();
            expect(vertex.result).toBeUndefined();
            expect(vertex.bounded).toBeUndefined();
        });
    });

    describe("ranges", () => {
        it("computes min/max ranges for objectives", () => {
            const solver = createMockSolver([
                { feasible: true, result: 100, obj1: 100, obj2: 20 },
                { feasible: true, result: 80, obj1: 50, obj2: 80 },
                { feasible: true, result: 90 }, // midpoint
            ]);

            const model: ModelDefinition = {
                optimize: {
                    obj1: "max",
                    obj2: "max",
                },
                opType: "max",
                constraints: {},
                variables: { x: { obj1: 10, obj2: 5 } },
            };

            const result = Polyopt(solver, model);

            expect(result.ranges.obj1.min).toBe(50);
            expect(result.ranges.obj1.max).toBe(100);
            expect(result.ranges.obj2.min).toBe(20);
            expect(result.ranges.obj2.max).toBe(80);
        });

        it("fills missing attributes with zero in ranges", () => {
            const solver = createMockSolver([
                { feasible: true, result: 100, obj1: 100 }, // Missing obj2
                { feasible: true, result: 80, obj1: 50, obj2: 80 },
                { feasible: true, result: 90 },
            ]);

            const model: ModelDefinition = {
                optimize: {
                    obj1: "max",
                    obj2: "max",
                },
                opType: "max",
                constraints: {},
                variables: { x: { obj1: 10, obj2: 5 } },
            };

            const result = Polyopt(solver, model);

            // obj2 min should account for the implicit zero
            expect(result.ranges.obj2.min).toBe(0);
        });
    });

    describe("backfillObjectiveAttributes", () => {
        it("computes objective values from variable contributions", () => {
            const solver = createMockSolver([
                { feasible: true, result: 50, x: 5, y: 3 },
                { feasible: true, result: 50, x: 5, y: 3 },
            ]);

            const model: ModelDefinition = {
                optimize: { profit: "max" },
                opType: "max",
                constraints: {},
                variables: {
                    x: { profit: 10 },
                    y: { profit: 5 },
                },
            };

            const result = Polyopt(solver, model);

            // profit = x*10 + y*5 = 5*10 + 3*5 = 65
            expect(result.vertices[0].profit).toBe(65);
        });

        it("skips backfill for explicit variable objectives", () => {
            const solver = createMockSolver([
                { feasible: true, result: 100, profit: 100 },
                { feasible: true, result: 100, profit: 100 },
            ]);

            const model: ModelDefinition = {
                optimize: { profit: "max" },
                opType: "max",
                constraints: {},
                variables: {
                    profit: { cost: 1 }, // profit is an explicit variable
                },
            };

            const result = Polyopt(solver, model);

            expect(result.vertices[0].profit).toBe(100);
        });
    });

    describe("solver interaction", () => {
        it("calls solver for each objective plus midpoint", () => {
            const solver = createMockSolver([
                { feasible: true, result: 100, obj1: 100, obj2: 50 },
                { feasible: true, result: 80, obj1: 50, obj2: 80 },
                { feasible: true, result: 75, obj1: 75, obj2: 65 },
            ]);

            const model: ModelDefinition = {
                optimize: {
                    obj1: "max",
                    obj2: "max",
                },
                opType: "max",
                constraints: {},
                variables: { x: { obj1: 10, obj2: 5 } },
            };

            Polyopt(solver, model);

            // 2 objectives + 1 midpoint = 3 calls
            expect(solver.Solve).toHaveBeenCalledTimes(3);
        });

        it("passes validate=true to solver", () => {
            const solver = createMockSolver([
                { feasible: true, result: 100 },
                { feasible: true, result: 100 },
            ]);

            const model: ModelDefinition = {
                optimize: { profit: "max" },
                opType: "max",
                constraints: {},
                variables: { x: { profit: 10 } },
            };

            Polyopt(solver, model);

            expect(solver.Solve).toHaveBeenCalledWith(
                expect.anything(),
                undefined,
                undefined,
                true
            );
        });

        it("does not modify original model", () => {
            const solver = createMockSolver([
                { feasible: true, result: 100, profit: 100 },
                { feasible: true, result: 100, profit: 100 },
            ]);

            const originalModel: ModelDefinition = {
                optimize: { profit: "max" },
                opType: "max",
                constraints: { time: { max: 100 } },
                variables: { x: { profit: 10, time: 2 } },
            };

            const originalConstraints = { ...originalModel.constraints };

            Polyopt(solver, originalModel);

            // Original model should be unchanged
            expect(originalModel.constraints).toEqual(originalConstraints);
            expect(originalModel.optimize).toEqual({ profit: "max" });
        });
    });

    describe("error handling", () => {
        it("throws error when solver returns non-object", () => {
            const solver = {
                Solve: vi.fn().mockReturnValue("not an object"),
            };

            const model: ModelDefinition = {
                optimize: { profit: "max" },
                opType: "max",
                constraints: {},
                variables: { x: { profit: 10 } },
            };

            expect(() => Polyopt(solver, model)).toThrow(
                "Polyopt requires the solver to return an object result"
            );
        });

        it("throws error when solver returns null", () => {
            const solver = {
                Solve: vi.fn().mockReturnValue(null),
            };

            const model: ModelDefinition = {
                optimize: { profit: "max" },
                opType: "max",
                constraints: {},
                variables: { x: { profit: 10 } },
            };

            expect(() => Polyopt(solver, model)).toThrow(
                "Polyopt requires the solver to return an object result"
            );
        });
    });

    describe("midpoint calculation", () => {
        it("adds equality constraints for midpoint solve", () => {
            let midpointModel: ModelDefinition | null = null;
            const solver = {
                Solve: vi.fn().mockImplementation((model: ModelDefinition) => {
                    midpointModel = model;
                    return { feasible: true, result: 75, obj1: 75, obj2: 65 };
                }),
            };

            const model: ModelDefinition = {
                optimize: {
                    obj1: "max",
                    obj2: "max",
                },
                opType: "max",
                constraints: {},
                variables: { x: { obj1: 10, obj2: 5 } },
            };

            Polyopt(solver, model);

            // Check that midpoint solve has equality constraints
            expect(midpointModel).not.toBeNull();
            expect(midpointModel!.constraints.obj1).toBeDefined();
            expect(midpointModel!.constraints.obj2).toBeDefined();
        });

        it("uses synthetic objective for midpoint", () => {
            let midpointModel: ModelDefinition | null = null;
            let callCount = 0;
            const solver = {
                Solve: vi.fn().mockImplementation((model: ModelDefinition) => {
                    callCount++;
                    if (callCount === 2) {
                        midpointModel = model;
                    }
                    return { feasible: true, result: 75, profit: 75 };
                }),
            };

            const model: ModelDefinition = {
                optimize: { profit: "max" },
                opType: "max",
                constraints: {},
                variables: { x: { profit: 10 } },
            };

            Polyopt(solver, model);

            // Midpoint model should have a synthetic objective
            expect(typeof midpointModel!.optimize).toBe("string");
            expect((midpointModel!.optimize as string).startsWith("cheater-")).toBe(true);
        });
    });
});
