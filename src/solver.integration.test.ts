/**
 * Integration tests for the LP solver
 *
 * These tests run the actual solver against known problems with expected results.
 * They exercise the full algorithm stack: model parsing, simplex, branch-and-cut, etc.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import solver from "./solver";
import Tableau from "./tableau/tableau";
import { createBranchAndCutService } from "./tableau/branch-and-cut";

interface TestModel {
    name: string;
    optimize: string | Record<string, "max" | "min">;
    opType: "max" | "min";
    constraints: Record<string, unknown>;
    variables: Record<string, Record<string, number>>;
    ints?: Record<string, 1>;
    binaries?: Record<string, 1>;
    unrestricted?: Record<string, 1>;
    expects: {
        feasible: boolean;
        result?: number;
        _timeout?: number;
        [key: string]: unknown;
    };
}

interface SolveResult {
    feasible: boolean;
    result?: number;
    bounded?: boolean;
    isIntegral?: boolean;
    [key: string]: unknown;
}

/**
 * Load all JSON test files from a directory
 */
function loadTestProblems(suiteName: string): TestModel[] {
    const suitePath = path.join(__dirname, "..", "test", suiteName);

    if (!fs.existsSync(suitePath)) {
        return [];
    }

    const jsonFiles = fs.readdirSync(suitePath).filter((file) => file.endsWith(".json"));

    return jsonFiles.map((fileName) => {
        const content = fs.readFileSync(path.join(suitePath, fileName), "utf8");
        return JSON.parse(content) as TestModel;
    });
}

/**
 * Normalize numeric values for comparison (handles floating point precision)
 */
function normalizeValue(value: unknown): unknown {
    if (typeof value === "string") {
        const numericValue = Number(value);
        if (!Number.isNaN(numericValue)) {
            return normalizeValue(numericValue);
        }
        return value;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
        return Number(value.toFixed(6));
    }

    return value ?? 0;
}

/**
 * Compare solution against expected results
 */
function compareSolutions(actual: SolveResult, expected: TestModel["expects"]): void {
    // Handle infeasible cases
    if (!actual.feasible && !expected.feasible) {
        expect(actual.feasible).toBe(false);
        return;
    }

    expect(actual.feasible).toBe(expected.feasible);

    // Compare each expected key
    for (const [key, expectedValue] of Object.entries(expected)) {
        if (key === "feasible" || key === "_timeout" || key === "isIntegral" || key === "bounded") {
            continue;
        }

        const actualValue = actual[key];
        const normalizedActual = normalizeValue(actualValue);
        const normalizedExpected = normalizeValue(expectedValue);

        expect(normalizedActual, `Mismatch for ${key}`).toBe(normalizedExpected);
    }
}

describe("Solver Integration Tests", () => {
    describe("Branch-and-cut service", () => {
        it("does not mutate the Tableau prototype when created", () => {
            // eslint-disable-next-line no-restricted-syntax
            const prototypeBefore = Object.getOwnPropertyNames(Tableau.prototype).sort();

            createBranchAndCutService();

            // eslint-disable-next-line no-restricted-syntax
            const prototypeAfter = Object.getOwnPropertyNames(Tableau.prototype).sort();
            expect(prototypeAfter).toEqual(prototypeBefore);
        });

        it("solves integer problems through the injected branch-and-cut service", () => {
            const integerModel: TestModel = {
                name: "Simple integer branch-and-cut model",
                optimize: "profit",
                opType: "max",
                constraints: {
                    capacity: { max: 5 },
                },
                variables: {
                    widget: {
                        capacity: 1,
                        profit: 1,
                    },
                },
                ints: {
                    widget: 1,
                },
                expects: {
                    feasible: true,
                    widget: 5,
                    result: 5,
                },
            };

            const result = solver.Solve(integerModel) as SolveResult;
            compareSolutions(result, integerModel.expects);
        });
    });

    describe("Variable-name objectives (issue #121)", () => {
        it("maximizes a variable when optimize names the variable directly", () => {
            const model = {
                optimize: "x",
                opType: "max" as const,
                constraints: {
                    v1: { min: -1, max: 1 },
                    v2: { min: -1, max: 1 },
                },
                variables: {
                    x: { v1: 1, v2: 1 },
                    y: { v1: 1, v2: -1 },
                },
            };

            const result = solver.Solve(model) as SolveResult;
            expect(result.feasible).toBe(true);
            expect(result.result).toBe(1);
            expect(result.x).toBe(1);
        });

        it("still uses attribute coefficients when optimize names a coefficient key", () => {
            const model = {
                optimize: "profit",
                opType: "max" as const,
                constraints: {
                    budget: { max: 10 },
                },
                variables: {
                    x: { budget: 2, profit: 5 },
                    y: { budget: 3, profit: 4 },
                },
            };

            const result = solver.Solve(model) as SolveResult;
            expect(result.feasible).toBe(true);
            expect(result.result).toBe(25);
            expect(result.x).toBe(5);
        });
    });

    describe("Unrestricted variables with Big-M (issue #130)", () => {
        it("finds optimal solution with unrestricted var and binary Big-M constraint", () => {
            // Absolute value constraint |d12| >= 220 using Big-M with binary variable.
            // The solver must correctly handle phase 1 when an unrestricted variable
            // (d12) becomes basic with a negative value.
            const W = 600;
            const N = W * 2; // Big-M
            const mind12 = 220;

            const model = {
                optimize: "bndOpt",
                opType: "min" as const,
                variables: {
                    I1: { "I1:max": 1, "d12:def": -1, b1_def: -1 },
                    I2: { "I2:max": 1, "d12:def": 1, b2_def: -1 },
                    d12: { "d12:def": 1, "d12:min": 1, "d12:max": 1 },
                    bin: { "d12:min": N, "d12:max": N },
                    b1_pos: { b1_def: 1, bndOpt: 1 },
                    b1_neg: { b1_def: -1, bndOpt: 1 },
                    b2_pos: { b2_def: 1, bndOpt: 1 },
                    b2_neg: { b2_def: -1, bndOpt: 1 },
                },
                constraints: {
                    "I1:max": { max: W - 200 },
                    "I2:max": { max: W - 200 },
                    "d12:def": { equal: 0 },
                    "d12:min": { min: mind12 },
                    "d12:max": { max: N - mind12 },
                    b1_def: { equal: -100 },
                    b2_def: { equal: -300 },
                },
                binaries: { bin: 1 },
                unrestricted: { d12: 1 },
            };

            const result = solver.Solve(model) as SolveResult;
            expect(result.feasible).toBe(true);
            // Optimal: bin=1, I1=80, I2=300, d12=-220, b1_neg=20 → objective=20
            // Suboptimal: bin=0, I1=400, I2=180, d12=220, b1_pos=300, b2_neg=120 → objective=420
            expect(result.result).toBe(20);
            expect(result.bin).toBe(1);
        });

        it("handles LP with unrestricted var forced to negative value via equality", () => {
            // Same problem but with bin fixed to 1 via equality (LP only).
            // Phase 1 must not treat negative-valued unrestricted basic variables
            // as infeasible.
            const N = 1200;
            const model = {
                optimize: "bndOpt",
                opType: "min" as const,
                variables: {
                    I1: { "I1:max": 1, "d12:def": -1, b1_def: -1 },
                    I2: { "I2:max": 1, "d12:def": 1, b2_def: -1 },
                    d12: { "d12:def": 1, "d12:min": 1, "d12:max": 1 },
                    bin: { "d12:min": N, "d12:max": N, bin_fix: 1 },
                    b1_pos: { b1_def: 1, bndOpt: 1 },
                    b1_neg: { b1_def: -1, bndOpt: 1 },
                    b2_pos: { b2_def: 1, bndOpt: 1 },
                    b2_neg: { b2_def: -1, bndOpt: 1 },
                },
                constraints: {
                    "I1:max": { max: 400 },
                    "I2:max": { max: 400 },
                    "d12:def": { equal: 0 },
                    "d12:min": { min: 220 },
                    "d12:max": { max: 980 },
                    b1_def: { equal: -100 },
                    b2_def: { equal: -300 },
                    bin_fix: { equal: 1 },
                },
                unrestricted: { d12: 1 },
            };

            const result = solver.Solve(model) as SolveResult;
            expect(result.feasible).toBe(true);
            expect(result.result).toBe(20);
            expect(result.d12).toBe(-220);
        });
    });

    describe("Test Suite: Sanity Tests", () => {
        const problems = loadTestProblems("test-sanity");

        if (problems.length === 0) {
            it.skip("No test problems found", () => {});
            return;
        }

        for (const problem of problems) {
            // Skip known slow tests that exceed reasonable CI timeouts
            const slowTests = ["Vendor Selection"];
            if (slowTests.includes(problem.name)) {
                it.skip(`solves: ${problem.name} (slow)`, () => {});
                continue;
            }

            const timeout = problem.expects._timeout ?? 30000;
            it(`solves: ${problem.name}`, { timeout }, () => {
                const result = solver.Solve(problem) as SolveResult;
                compareSolutions(result, problem.expects);
            });
        }
    });
});
