import { describe, it, expect } from "vitest";
import { Solution, MilpSolution } from "./solution";

/**
 * Creates a mock Tableau for testing Solution classes.
 */
function createMockTableau(options: {
    width: number;
    height: number;
    matrix: Float64Array;
    rhsColumn: number;
    precision: number;
    varIndexByRow: number[];
    variablesPerIndex: Array<{ id: string; isSlack?: boolean } | undefined>;
}) {
    return {
        width: options.width,
        height: options.height,
        matrix: options.matrix,
        rhsColumn: options.rhsColumn,
        precision: options.precision,
        varIndexByRow: options.varIndexByRow,
        variablesPerIndex: options.variablesPerIndex,
    } as never;
}

describe("Solution", () => {
    describe("constructor", () => {
        it("creates a solution with provided properties", () => {
            const tableau = createMockTableau({
                width: 3,
                height: 2,
                matrix: new Float64Array(6),
                rhsColumn: 2,
                precision: 1e-9,
                varIndexByRow: [0, 1],
                variablesPerIndex: [undefined, { id: "x" }],
            });

            const solution = new Solution(tableau, 42.5, true, true);

            expect(solution.feasible).toBe(true);
            expect(solution.evaluation).toBe(42.5);
            expect(solution.bounded).toBe(true);
            expect(solution._tableau).toBe(tableau);
            expect(solution.solutionSet).toEqual({});
        });

        it("creates an infeasible solution", () => {
            const tableau = createMockTableau({
                width: 3,
                height: 2,
                matrix: new Float64Array(6),
                rhsColumn: 2,
                precision: 1e-9,
                varIndexByRow: [0, 1],
                variablesPerIndex: [undefined, { id: "x" }],
            });

            const solution = new Solution(tableau, 0, false, false);

            expect(solution.feasible).toBe(false);
            expect(solution.bounded).toBe(false);
        });

        it("creates an unbounded solution", () => {
            const tableau = createMockTableau({
                width: 3,
                height: 2,
                matrix: new Float64Array(6),
                rhsColumn: 2,
                precision: 1e-9,
                varIndexByRow: [0, 1],
                variablesPerIndex: [undefined, { id: "x" }],
            });

            const solution = new Solution(tableau, Infinity, true, false);

            expect(solution.feasible).toBe(true);
            expect(solution.bounded).toBe(false);
            expect(solution.evaluation).toBe(Infinity);
        });
    });

    describe("generateSolutionSet", () => {
        it("generates solution set with variable values", () => {
            const tableau = createMockTableau({
                width: 3,
                height: 3,
                matrix: new Float64Array([
                    0,
                    0,
                    100, // row 0: objective
                    0,
                    0,
                    5, // row 1: x = 5
                    0,
                    0,
                    3, // row 2: y = 3
                ]),
                rhsColumn: 2,
                precision: 1e-9,
                varIndexByRow: [0, 1, 2],
                variablesPerIndex: [undefined, { id: "x" }, { id: "y" }],
            });

            const solution = new Solution(tableau, 100, true, true);
            const result = solution.generateSolutionSet();

            expect(result).toEqual({ x: 5, y: 3 });
        });

        it("skips undefined variables", () => {
            const tableau = createMockTableau({
                width: 3,
                height: 3,
                matrix: new Float64Array([0, 0, 100, 0, 0, 5, 0, 0, 3]),
                rhsColumn: 2,
                precision: 1e-9,
                varIndexByRow: [0, 1, 2],
                variablesPerIndex: [undefined, undefined, { id: "y" }], // x is undefined
            });

            const solution = new Solution(tableau, 100, true, true);
            const result = solution.generateSolutionSet();

            expect(result).toEqual({ y: 3 });
        });

        it("skips slack variables", () => {
            const tableau = createMockTableau({
                width: 3,
                height: 3,
                matrix: new Float64Array([
                    0,
                    0,
                    100,
                    0,
                    0,
                    5, // slack variable
                    0,
                    0,
                    3, // regular variable
                ]),
                rhsColumn: 2,
                precision: 1e-9,
                varIndexByRow: [0, 1, 2],
                variablesPerIndex: [
                    undefined,
                    { id: "s1", isSlack: true },
                    { id: "y", isSlack: false },
                ],
            });

            const solution = new Solution(tableau, 100, true, true);
            const result = solution.generateSolutionSet();

            expect(result).toEqual({ y: 3 });
        });

        it("rounds values according to precision", () => {
            const precision = 1e-6;
            const tableau = createMockTableau({
                width: 3,
                height: 2,
                matrix: new Float64Array([
                    0,
                    0,
                    100,
                    0,
                    0,
                    5.0000001, // Should round to 5
                ]),
                rhsColumn: 2,
                precision,
                varIndexByRow: [0, 1],
                variablesPerIndex: [undefined, { id: "x" }],
            });

            const solution = new Solution(tableau, 100, true, true);
            const result = solution.generateSolutionSet();

            expect(result.x).toBe(5);
        });

        it("handles fractional values with proper rounding", () => {
            const precision = 1e-9;
            const tableau = createMockTableau({
                width: 3,
                height: 2,
                matrix: new Float64Array([0, 0, 100, 0, 0, 2.5]),
                rhsColumn: 2,
                precision,
                varIndexByRow: [0, 1],
                variablesPerIndex: [undefined, { id: "x" }],
            });

            const solution = new Solution(tableau, 100, true, true);
            const result = solution.generateSolutionSet();

            expect(result.x).toBe(2.5);
        });

        it("handles zero values", () => {
            const tableau = createMockTableau({
                width: 3,
                height: 2,
                matrix: new Float64Array([0, 0, 100, 0, 0, 0]),
                rhsColumn: 2,
                precision: 1e-9,
                varIndexByRow: [0, 1],
                variablesPerIndex: [undefined, { id: "x" }],
            });

            const solution = new Solution(tableau, 100, true, true);
            const result = solution.generateSolutionSet();

            expect(result.x).toBe(0);
        });

        it("handles negative values", () => {
            const tableau = createMockTableau({
                width: 3,
                height: 2,
                matrix: new Float64Array([0, 0, 100, 0, 0, -7.5]),
                rhsColumn: 2,
                precision: 1e-9,
                varIndexByRow: [0, 1],
                variablesPerIndex: [undefined, { id: "x" }],
            });

            const solution = new Solution(tableau, 100, true, true);
            const result = solution.generateSolutionSet();

            expect(result.x).toBe(-7.5);
        });

        it("returns empty object when no variables exist", () => {
            const tableau = createMockTableau({
                width: 3,
                height: 1,
                matrix: new Float64Array([0, 0, 100]),
                rhsColumn: 2,
                precision: 1e-9,
                varIndexByRow: [0],
                variablesPerIndex: [undefined],
            });

            const solution = new Solution(tableau, 100, true, true);
            const result = solution.generateSolutionSet();

            expect(result).toEqual({});
        });

        it("handles multiple variables correctly", () => {
            const tableau = createMockTableau({
                width: 5,
                height: 5,
                matrix: new Float64Array([
                    0,
                    0,
                    0,
                    0,
                    500, // objective
                    0,
                    0,
                    0,
                    0,
                    10, // a = 10
                    0,
                    0,
                    0,
                    0,
                    20, // b = 20
                    0,
                    0,
                    0,
                    0,
                    30, // c = 30
                    0,
                    0,
                    0,
                    0,
                    40, // d = 40
                ]),
                rhsColumn: 4,
                precision: 1e-9,
                varIndexByRow: [0, 1, 2, 3, 4],
                variablesPerIndex: [undefined, { id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
            });

            const solution = new Solution(tableau, 500, true, true);
            const result = solution.generateSolutionSet();

            expect(result).toEqual({ a: 10, b: 20, c: 30, d: 40 });
        });
    });
});

describe("MilpSolution", () => {
    describe("constructor", () => {
        it("extends Solution with iteration count", () => {
            const tableau = createMockTableau({
                width: 3,
                height: 2,
                matrix: new Float64Array(6),
                rhsColumn: 2,
                precision: 1e-9,
                varIndexByRow: [0, 1],
                variablesPerIndex: [undefined, { id: "x" }],
            });

            const solution = new MilpSolution(tableau, 42.5, true, true, 150);

            expect(solution.feasible).toBe(true);
            expect(solution.evaluation).toBe(42.5);
            expect(solution.bounded).toBe(true);
            expect(solution.iter).toBe(150);
            expect(solution._tableau).toBe(tableau);
        });

        it("inherits generateSolutionSet from Solution", () => {
            const tableau = createMockTableau({
                width: 3,
                height: 3,
                matrix: new Float64Array([0, 0, 100, 0, 0, 5, 0, 0, 3]),
                rhsColumn: 2,
                precision: 1e-9,
                varIndexByRow: [0, 1, 2],
                variablesPerIndex: [undefined, { id: "x" }, { id: "y" }],
            });

            const solution = new MilpSolution(tableau, 100, true, true, 50);
            const result = solution.generateSolutionSet();

            expect(result).toEqual({ x: 5, y: 3 });
        });

        it("handles zero iterations", () => {
            const tableau = createMockTableau({
                width: 3,
                height: 2,
                matrix: new Float64Array(6),
                rhsColumn: 2,
                precision: 1e-9,
                varIndexByRow: [0, 1],
                variablesPerIndex: [undefined, { id: "x" }],
            });

            const solution = new MilpSolution(tableau, 0, false, false, 0);

            expect(solution.iter).toBe(0);
            expect(solution.feasible).toBe(false);
        });

        it("tracks high iteration counts", () => {
            const tableau = createMockTableau({
                width: 3,
                height: 2,
                matrix: new Float64Array(6),
                rhsColumn: 2,
                precision: 1e-9,
                varIndexByRow: [0, 1],
                variablesPerIndex: [undefined, { id: "x" }],
            });

            const solution = new MilpSolution(tableau, 100, true, true, 1000000);

            expect(solution.iter).toBe(1000000);
        });
    });
});
