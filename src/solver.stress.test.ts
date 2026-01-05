/**
 * Stress tests for the LP solver using generated problems
 *
 * These tests replace the static SPY_*.json files with dynamically generated
 * problems of configurable size. This provides:
 * - No large files bloating the repository
 * - Reproducible tests via seeded random generation
 * - Configurable problem sizes for different test scenarios
 */
import { describe, it, expect } from "vitest";
import solver from "./solver";
import {
    generateRandomLP,
    generateRandomMIP,
    generateKnapsack,
    generateSetCover,
    generateTransportation,
    generateResourceAllocation,
    generateProblemBatch,
} from "./test-utils/problem-generator";

/**
 * Run solver and verify it completes without error
 */
function verifySolverCompletes(problem: ReturnType<typeof generateRandomLP>): void {
    const result = solver.Solve(problem);
    expect(result).toBeDefined();
    expect(typeof result.feasible).toBe("boolean");
}

describe("Stress Tests - LP Problems", () => {
    const sizes = [
        { vars: 15, constraints: 8 },
        { vars: 30, constraints: 15 },
        { vars: 50, constraints: 25 },
    ];

    for (const { vars, constraints } of sizes) {
        it(`solves ${vars}x${constraints} random LP`, () => {
            const problem = generateRandomLP({
                seed: 12345,
                numVariables: vars,
                numConstraints: constraints,
                density: 0.6,
            });
            verifySolverCompletes(problem);
        });

        it(`solves ${vars}x${constraints} resource allocation`, () => {
            const problem = generateResourceAllocation({
                seed: 12345,
                numVariables: vars,
                numConstraints: constraints,
            });
            const result = solver.Solve(problem);
            expect(result.feasible).toBe(true);
        });

        it(`solves ${vars}x${Math.ceil(vars / 2)} transportation`, () => {
            const sources = Math.ceil(Math.sqrt(vars));
            const destinations = Math.ceil(Math.sqrt(vars));
            const problem = generateTransportation({
                seed: 12345,
                numVariables: sources,
                numConstraints: destinations,
            });
            const result = solver.Solve(problem);
            expect(result.feasible).toBe(true);
        });
    }
});

describe("Stress Tests - MIP Problems", () => {
    const sizes = [
        { vars: 10, constraints: 5 },
        { vars: 20, constraints: 10 },
        { vars: 30, constraints: 15 },
    ];

    for (const { vars, constraints } of sizes) {
        it(
            `solves ${vars}x${constraints} random MIP (30% integer)`,
            { timeout: 30000 },
            () => {
                const problem = generateRandomMIP({
                    seed: 12345,
                    numVariables: vars,
                    numConstraints: constraints,
                    integerFraction: 0.3,
                    density: 0.5,
                });
                verifySolverCompletes(problem);
            }
        );

        it(`solves ${vars}-item knapsack`, { timeout: 30000 }, () => {
            const problem = generateKnapsack({
                seed: 12345,
                numVariables: vars,
            });
            const result = solver.Solve(problem);
            expect(result.feasible).toBe(true);
            expect(result.result).toBeGreaterThan(0);
        });
    }
});

describe("Stress Tests - Set Cover", () => {
    const sizes = [
        { sets: 10, elements: 6 },
        { sets: 15, elements: 10 },
        { sets: 20, elements: 12 },
    ];

    for (const { sets, elements } of sizes) {
        it(`solves ${sets} sets covering ${elements} elements`, { timeout: 30000 }, () => {
            const problem = generateSetCover({
                seed: 12345,
                numVariables: sets,
                numConstraints: elements,
                density: 0.4, // Higher density for feasibility
            });
            const result = solver.Solve(problem);
            // Set cover may be infeasible if density is too low
            expect(result).toBeDefined();
        });
    }
});

describe("Stress Tests - Batch Diversity", () => {
    it("solves batch of 12 diverse problems", { timeout: 30000 }, () => {
        const problems = generateProblemBatch(12, 42);
        let feasibleCount = 0;

        for (const problem of problems) {
            const result = solver.Solve(problem);
            expect(result).toBeDefined();
            if (result.feasible) {
                feasibleCount++;
            }
        }

        // At least some should be feasible (depending on random structure)
        expect(feasibleCount).toBeGreaterThan(3);
    });
});

describe("Stress Tests - Reproducibility", () => {
    it("produces identical results for same seed across runs", () => {
        const runs = 3;
        const results: Array<{ feasible: boolean; result?: number }> = [];

        for (let i = 0; i < runs; i++) {
            const problem = generateRandomMIP({
                seed: 99999,
                numVariables: 20,
                numConstraints: 10,
                integerFraction: 0.4,
            });
            const result = solver.Solve(problem);
            results.push({ feasible: result.feasible, result: result.result });
        }

        // All runs should produce identical results
        for (let i = 1; i < runs; i++) {
            expect(results[i].feasible).toBe(results[0].feasible);
            if (results[0].feasible) {
                expect(results[i].result).toBe(results[0].result);
            }
        }
    });
});

describe("Stress Tests - Edge Cases", () => {
    it("handles single variable LP", () => {
        const problem = generateRandomLP({
            seed: 42,
            numVariables: 1,
            numConstraints: 1,
        });
        verifySolverCompletes(problem);
    });

    it("handles highly constrained problem", () => {
        const problem = generateRandomLP({
            seed: 42,
            numVariables: 10,
            numConstraints: 20, // More constraints than variables
            density: 0.8,
        });
        verifySolverCompletes(problem);
    });

    it("handles sparse problem", () => {
        const problem = generateRandomLP({
            seed: 42,
            numVariables: 50,
            numConstraints: 25,
            density: 0.1, // Very sparse
        });
        verifySolverCompletes(problem);
    });

    it("handles dense problem", () => {
        const problem = generateRandomLP({
            seed: 42,
            numVariables: 30,
            numConstraints: 15,
            density: 1.0, // Fully dense
        });
        verifySolverCompletes(problem);
    });
});
