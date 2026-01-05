import assert from "assert";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

import solver from "../src/solver";
import Tableau from "../src/tableau/tableau";
import { createBranchAndCutService } from "../src/tableau/branch-and-cut";
import type { ProblemExpectations, TestModel } from "./types";

const requireForExtensions = createRequire(__filename);

if (!requireForExtensions.extensions[".ts"]) {
    throw new Error("TypeScript loader missing: sanity tests must exercise .ts sources.");
}

const DEFAULT_SUITE = "test-sanity";

function getSuiteName(): string {
    if (process.env.JSLP_TEST_SUITE) {
        return process.env.JSLP_TEST_SUITE;
    }

    const positionalArgs = process.argv
        .slice(2)
        .filter(
            (arg) =>
                arg &&
                arg[0] !== "-" &&
                !/\.ts$/.test(arg) &&
                arg.indexOf("solver-problems.ts") === -1
        );

    if (positionalArgs.length > 0) {
        return positionalArgs[0];
    }

    return DEFAULT_SUITE;
}

function normalizeSuiteName(rawSuite: string): string {
    const trimmed = rawSuite.trim();
    if (trimmed.indexOf("test/") === 0) {
        return trimmed.substring(5);
    }

    return trimmed;
}

const pathOf = normalizeSuiteName(getSuiteName());
const suitePath = path.join(__dirname, pathOf);

if (!fs.existsSync(suitePath)) {
    throw new Error("Unable to find test suite directory: " + suitePath);
}

const jsonFiles = fs.readdirSync(suitePath).filter((file) => /\.json$/.test(file));

const problems: TestModel[] = jsonFiles.map((fileName) => {
    const rawModel = fs.readFileSync(path.join(suitePath, fileName), "utf8");
    // eslint-disable-next-line no-console
    console.log("opening - ", fileName);
    return JSON.parse(rawModel) as TestModel;
});

function normalizeValue(value: number | boolean | string | undefined): number | boolean | string {
    if (typeof value === "string") {
        const numericValue = Number(value);
        if (!Number.isNaN(numericValue)) {
            return normalizeValue(numericValue);
        }
        return value;
    }

    if (typeof value === "number") {
        if (Number.isFinite(value)) {
            return Number(value.toFixed(6));
        }
        return value;
    }

    return value ?? 0;
}

function assertSolution(solutionA: ProblemExpectations, solutionB: ProblemExpectations) {
    if (solutionA.feasible === false && solutionB.feasible === false) {
        return assert.deepStrictEqual(true, true);
    }

    const cleanSolutionA: ProblemExpectations = { ...solutionA };
    const cleanSolutionB: ProblemExpectations = { ...solutionB };

    ["isIntegral", "bounded"].forEach((noiseKey) => {
        delete (cleanSolutionA as Record<string, unknown>)[noiseKey];
        delete (cleanSolutionB as Record<string, unknown>)[noiseKey];
    });

    const keys: Record<string, 1> = {};
    const failActual: Record<string, unknown> = {};
    const failExpects: Record<string, unknown> = {};

    Object.keys(cleanSolutionA).forEach((key) => {
        keys[key] = 1;
    });

    Object.keys(cleanSolutionB).forEach((key) => {
        keys[key] = 1;
    });

    Object.keys(keys).forEach((key) => {
        if (key === "feasible") {
            return;
        }

        const tempA: Record<string, unknown> = {};
        const tempB: Record<string, unknown> = {};

        if (typeof cleanSolutionB[key] === "undefined") {
            tempA[key] = cleanSolutionA[key];
            tempB[key] = 0;
        } else if (typeof cleanSolutionA[key] === "undefined") {
            tempB[key] = cleanSolutionB[key];
            tempA[key] = 0;
        } else {
            tempA[key] = normalizeValue(cleanSolutionA[key]);
            tempB[key] = normalizeValue(cleanSolutionB[key]);
        }

        try {
            assert.deepStrictEqual(tempA, tempB);
        } catch (error) {
            failActual[key] = cleanSolutionA[key];
            failExpects[key] = cleanSolutionB[key];
        }
    });

    return assert.deepStrictEqual(failActual, failExpects);
}

describe("Branch-and-cut service", () => {
    it("does not mutate the Tableau prototype when created", () => {
        const prototypeBefore = Object.getOwnPropertyNames(Tableau.prototype).sort();

        createBranchAndCutService();

        const prototypeAfter = Object.getOwnPropertyNames(Tableau.prototype).sort();
        assert.deepStrictEqual(prototypeAfter, prototypeBefore);
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

        const solverInstance = solver;
        const obtainedResult = solverInstance.Solve(integerModel) as ProblemExpectations;
        assertSolution(obtainedResult, integerModel.expects);
    });
});

describe("Test Suite of EXPECTED results to ACTUAL results:", function () {
    const solverInstance = solver;

    problems.forEach((jsonModel) => {
        it("Model Name: " + jsonModel.name, function () {
            const expectations: ProblemExpectations = { ...jsonModel.expects };

            if (expectations._timeout) {
                this.timeout(expectations._timeout);
                delete expectations._timeout;
            }

            const expectedResult = expectations;
            const obtainedResult = solverInstance.Solve(jsonModel) as ProblemExpectations;

            assertSolution(obtainedResult, expectedResult);
        });
    });
});
