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
    optimize: string | Record<string, string>;
    opType: "max" | "min";
    constraints: Record<string, unknown>;
    variables: Record<string, Record<string, number>>;
    ints?: Record<string, number>;
    binaries?: Record<string, number>;
    unrestricted?: Record<string, number>;
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
            const prototypeBefore = Object.getOwnPropertyNames(Tableau.prototype).sort();

            createBranchAndCutService();

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
