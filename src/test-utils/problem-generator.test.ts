import { describe, it, expect } from "vitest";
import {
    generateRandomLP,
    generateRandomMIP,
    generateKnapsack,
    generateSetCover,
    generateTransportation,
    generateResourceAllocation,
    generateProblemBatch,
} from "./problem-generator";
import solver from "../solver";

describe("Problem Generator", () => {
    describe("generateRandomLP", () => {
        it("creates problem with correct structure", () => {
            const problem = generateRandomLP({ seed: 42, numVariables: 5, numConstraints: 3 });

            expect(problem.name).toContain("RandomLP");
            expect(problem.optimize).toBe("objective");
            expect(Object.keys(problem.variables)).toHaveLength(5);
            expect(Object.keys(problem.constraints)).toHaveLength(3);
            expect(problem.ints).toBeUndefined();
            expect(problem.binaries).toBeUndefined();
        });

        it("produces deterministic results with same seed", () => {
            const p1 = generateRandomLP({ seed: 123, numVariables: 10 });
            const p2 = generateRandomLP({ seed: 123, numVariables: 10 });

            expect(p1).toEqual(p2);
        });

        it("produces different results with different seeds", () => {
            const p1 = generateRandomLP({ seed: 123, numVariables: 10 });
            const p2 = generateRandomLP({ seed: 456, numVariables: 10 });

            expect(p1.variables).not.toEqual(p2.variables);
        });

        it("generates solvable problems", () => {
            const problem = generateRandomLP({ seed: 42, numVariables: 5, numConstraints: 3 });
            const result = solver.Solve(problem);

            // Should complete without error (may be feasible or infeasible)
            expect(result).toBeDefined();
            expect(typeof result.feasible).toBe("boolean");
        });
    });

    describe("generateRandomMIP", () => {
        it("creates problem with integer variables", () => {
            const problem = generateRandomMIP({
                seed: 42,
                numVariables: 10,
                integerFraction: 0.5,
                binaryFraction: 0,
            });

            expect(problem.name).toContain("RandomMIP");
            expect(problem.ints).toBeDefined();
            expect(Object.keys(problem.ints!).length).toBeGreaterThan(0);
        });

        it("creates problem with binary variables", () => {
            const problem = generateRandomMIP({
                seed: 42,
                numVariables: 10,
                integerFraction: 0,
                binaryFraction: 0.5,
            });

            expect(problem.binaries).toBeDefined();
            expect(Object.keys(problem.binaries!).length).toBeGreaterThan(0);
        });

        it("generates solvable MIP problems", () => {
            const problem = generateRandomMIP({
                seed: 42,
                numVariables: 6,
                numConstraints: 3,
                integerFraction: 0.3,
            });
            const result = solver.Solve(problem);

            expect(result).toBeDefined();
            expect(typeof result.feasible).toBe("boolean");
        });
    });

    describe("generateKnapsack", () => {
        it("creates classic knapsack structure", () => {
            const problem = generateKnapsack({ seed: 42, numVariables: 10 });

            expect(problem.name).toContain("Knapsack");
            expect(problem.optimize).toBe("value");
            expect(problem.opType).toBe("max");
            expect(problem.constraints.capacity).toBeDefined();
            expect(problem.constraints.capacity.max).toBeGreaterThan(0);
            expect(problem.binaries).toBeDefined();
            expect(Object.keys(problem.binaries!)).toHaveLength(10);

            // Each variable should have value and weight
            for (const varData of Object.values(problem.variables)) {
                expect(varData.value).toBeDefined();
                expect(varData.weight).toBeDefined();
            }
        });

        it("generates solvable knapsack problems", () => {
            const problem = generateKnapsack({ seed: 42, numVariables: 8 });
            const result = solver.Solve(problem);

            expect(result.feasible).toBe(true);
            expect(result.result).toBeGreaterThan(0);
        });
    });

    describe("generateSetCover", () => {
        it("creates set cover structure", () => {
            const problem = generateSetCover({
                seed: 42,
                numVariables: 8,
                numConstraints: 5,
            });

            expect(problem.name).toContain("SetCover");
            expect(problem.optimize).toBe("cost");
            expect(problem.opType).toBe("min");
            expect(problem.binaries).toBeDefined();
            expect(Object.keys(problem.binaries!)).toHaveLength(8);

            // Each element constraint should require >= 1 coverage
            for (let e = 0; e < 5; e++) {
                expect(problem.constraints[`element${e}`]).toBeDefined();
                expect(problem.constraints[`element${e}`].min).toBe(1);
            }
        });

        it("generates solvable set cover problems", () => {
            // Use high density to ensure feasibility
            const problem = generateSetCover({
                seed: 42,
                numVariables: 10,
                numConstraints: 5,
                density: 0.5,
            });
            const result = solver.Solve(problem);

            expect(result.feasible).toBe(true);
        });
    });

    describe("generateTransportation", () => {
        it("creates transportation problem structure", () => {
            const problem = generateTransportation({
                seed: 42,
                numVariables: 3, // sources
                numConstraints: 4, // destinations
            });

            expect(problem.name).toContain("Transportation");
            expect(problem.optimize).toBe("cost");
            expect(problem.opType).toBe("min");

            // Should have source * destination shipping variables
            expect(Object.keys(problem.variables)).toHaveLength(12);

            // Each shipping variable contributes to one supply and one demand constraint
            const firstVar = problem.variables["ship_0_to_0"];
            expect(firstVar.cost).toBeDefined();
            expect(firstVar.supply0).toBe(1);
            expect(firstVar.demand0).toBe(1);
        });

        it("generates solvable transportation problems", () => {
            const problem = generateTransportation({
                seed: 42,
                numVariables: 3,
                numConstraints: 3,
            });
            const result = solver.Solve(problem);

            expect(result.feasible).toBe(true);
        });
    });

    describe("generateResourceAllocation", () => {
        it("creates resource allocation structure", () => {
            const problem = generateResourceAllocation({
                seed: 42,
                numVariables: 6,
                numConstraints: 3,
            });

            expect(problem.name).toContain("ResourceAllocation");
            expect(problem.optimize).toBe("profit");
            expect(problem.opType).toBe("max");

            // Should have resource limits
            for (let r = 0; r < 3; r++) {
                expect(problem.constraints[`resource${r}`]).toBeDefined();
                expect(problem.constraints[`resource${r}`].max).toBeGreaterThan(0);
            }
        });

        it("generates solvable resource allocation problems", () => {
            const problem = generateResourceAllocation({
                seed: 42,
                numVariables: 5,
                numConstraints: 3,
            });
            const result = solver.Solve(problem);

            expect(result.feasible).toBe(true);
            expect(result.result).toBeGreaterThan(0);
        });
    });

    describe("generateProblemBatch", () => {
        it("creates diverse batch of problems", () => {
            const problems = generateProblemBatch(12, 42);

            expect(problems).toHaveLength(12);

            // Should have mix of problem types
            const names = problems.map((p) => p.name);
            expect(names.some((n) => n.includes("RandomLP"))).toBe(true);
            expect(names.some((n) => n.includes("RandomMIP"))).toBe(true);
            expect(names.some((n) => n.includes("Knapsack"))).toBe(true);
            expect(names.some((n) => n.includes("SetCover"))).toBe(true);
            expect(names.some((n) => n.includes("Transportation"))).toBe(true);
            expect(names.some((n) => n.includes("ResourceAllocation"))).toBe(true);
        });

        it("produces deterministic batch with same seed", () => {
            const batch1 = generateProblemBatch(6, 42);
            const batch2 = generateProblemBatch(6, 42);

            expect(batch1).toEqual(batch2);
        });
    });
});

describe("Generated Problem Stress Tests", () => {
    const PROBLEM_SIZES = [
        { vars: 10, constraints: 5 },
        { vars: 25, constraints: 15 },
        { vars: 50, constraints: 30 },
    ];

    for (const { vars, constraints } of PROBLEM_SIZES) {
        describe(`Size ${vars}x${constraints}`, () => {
            it("solves random LP", () => {
                const problem = generateRandomLP({
                    seed: 42,
                    numVariables: vars,
                    numConstraints: constraints,
                });
                const result = solver.Solve(problem);
                expect(result).toBeDefined();
            });

            it("solves random MIP", () => {
                const problem = generateRandomMIP({
                    seed: 42,
                    numVariables: vars,
                    numConstraints: constraints,
                    integerFraction: 0.3,
                });
                const result = solver.Solve(problem);
                expect(result).toBeDefined();
            });

            it("solves knapsack", () => {
                const problem = generateKnapsack({
                    seed: 42,
                    numVariables: vars,
                });
                const result = solver.Solve(problem);
                expect(result.feasible).toBe(true);
            });
        });
    }
});

describe("Seed Reproducibility", () => {
    it("same seed produces identical solver results", () => {
        const problem1 = generateRandomMIP({ seed: 999, numVariables: 15, numConstraints: 8 });
        const problem2 = generateRandomMIP({ seed: 999, numVariables: 15, numConstraints: 8 });

        const result1 = solver.Solve(problem1);
        const result2 = solver.Solve(problem2);

        expect(result1.feasible).toBe(result2.feasible);
        if (result1.feasible && result2.feasible) {
            expect(result1.result).toBe(result2.result);
        }
    });
});
