import { describe, it, expect } from "vitest";
import {
    countIntegerValues,
    isIntegral,
    computeFractionalVolume,
    getMostFractionalVar,
    getFractionalVarWithLowestCost,
} from "./mip-utils";

/**
 * Creates a mock Tableau context for testing MIP utility functions.
 * These functions use `this` to access tableau properties.
 */
function createMockTableau(options: {
    width: number;
    height: number;
    matrix: Float64Array;
    rhsColumn: number;
    precision: number;
    variablesPerIndex: Array<{ isInteger: boolean; index: number; cost: number } | undefined>;
    varIndexByRow: number[];
    rowByVarIndex: number[];
    model?: { integerVariables: Array<{ index: number; cost: number }> };
}) {
    return {
        width: options.width,
        height: options.height,
        matrix: options.matrix,
        rhsColumn: options.rhsColumn,
        precision: options.precision,
        variablesPerIndex: options.variablesPerIndex,
        varIndexByRow: options.varIndexByRow,
        rowByVarIndex: options.rowByVarIndex,
        model: options.model || { integerVariables: [] },
    };
}

describe("countIntegerValues", () => {
    it("returns 0 when no integer variables exist", () => {
        const tableau = createMockTableau({
            width: 3,
            height: 2,
            matrix: new Float64Array([0, 0, 0, 0, 0, 5]),
            rhsColumn: 2,
            precision: 1e-9,
            variablesPerIndex: [undefined, { isInteger: false, index: 1, cost: 1 }],
            varIndexByRow: [0, 1],
            rowByVarIndex: [-1, 1],
        });

        const result = countIntegerValues.call(tableau as never);
        expect(result).toBe(0);
    });

    it("counts integer variables with integral values", () => {
        // Matrix: row 0 is objective, rows 1-2 are constraints
        // Width 3: 2 variables + 1 RHS column
        const tableau = createMockTableau({
            width: 3,
            height: 3,
            matrix: new Float64Array([
                0, 0, 0, // row 0: objective
                0, 0, 5.0, // row 1: var 1 = 5.0 (integral)
                0, 0, 3.0, // row 2: var 2 = 3.0 (integral)
            ]),
            rhsColumn: 2,
            precision: 1e-9,
            variablesPerIndex: [
                undefined,
                { isInteger: true, index: 1, cost: 1 },
                { isInteger: true, index: 2, cost: 2 },
            ],
            varIndexByRow: [0, 1, 2],
            rowByVarIndex: [-1, 1, 2],
        });

        const result = countIntegerValues.call(tableau as never);
        expect(result).toBe(2);
    });

    it("excludes integer variables with fractional values from count", () => {
        const tableau = createMockTableau({
            width: 3,
            height: 3,
            matrix: new Float64Array([
                0, 0, 0, // row 0
                0, 0, 5.0, // row 1: integral
                0, 0, 3.5, // row 2: fractional
            ]),
            rhsColumn: 2,
            precision: 1e-9,
            variablesPerIndex: [
                undefined,
                { isInteger: true, index: 1, cost: 1 },
                { isInteger: true, index: 2, cost: 2 },
            ],
            varIndexByRow: [0, 1, 2],
            rowByVarIndex: [-1, 1, 2],
        });

        const result = countIntegerValues.call(tableau as never);
        expect(result).toBe(1);
    });

    it("handles values within precision as integral", () => {
        const precision = 1e-6;
        const tableau = createMockTableau({
            width: 3,
            height: 2,
            matrix: new Float64Array([
                0, 0, 0,
                0, 0, 5.0000001, // Very close to 5, within precision
            ]),
            rhsColumn: 2,
            precision,
            variablesPerIndex: [undefined, { isInteger: true, index: 1, cost: 1 }],
            varIndexByRow: [0, 1],
            rowByVarIndex: [-1, 1],
        });

        const result = countIntegerValues.call(tableau as never);
        expect(result).toBe(1);
    });

    it("skips non-integer variables", () => {
        const tableau = createMockTableau({
            width: 3,
            height: 3,
            matrix: new Float64Array([
                0, 0, 0,
                0, 0, 5.0, // var 1: continuous, integral value
                0, 0, 3.0, // var 2: integer, integral value
            ]),
            rhsColumn: 2,
            precision: 1e-9,
            variablesPerIndex: [
                undefined,
                { isInteger: false, index: 1, cost: 1 }, // continuous
                { isInteger: true, index: 2, cost: 2 }, // integer
            ],
            varIndexByRow: [0, 1, 2],
            rowByVarIndex: [-1, 1, 2],
        });

        const result = countIntegerValues.call(tableau as never);
        expect(result).toBe(1); // Only counts the integer variable
    });
});

describe("isIntegral", () => {
    it("returns true when all integer variables have integral values", () => {
        const tableau = createMockTableau({
            width: 3,
            height: 3,
            matrix: new Float64Array([
                0, 0, 0,
                0, 0, 5.0,
                0, 0, 3.0,
            ]),
            rhsColumn: 2,
            precision: 1e-9,
            variablesPerIndex: [
                undefined,
                { isInteger: true, index: 1, cost: 1 },
                { isInteger: true, index: 2, cost: 2 },
            ],
            varIndexByRow: [0, 1, 2],
            rowByVarIndex: [-1, 1, 2],
            model: {
                integerVariables: [
                    { index: 1, cost: 1 },
                    { index: 2, cost: 2 },
                ],
            },
        });

        const result = isIntegral.call(tableau as never);
        expect(result).toBe(true);
    });

    it("returns false when any integer variable has fractional value", () => {
        const tableau = createMockTableau({
            width: 3,
            height: 3,
            matrix: new Float64Array([
                0, 0, 0,
                0, 0, 5.0, // integral
                0, 0, 3.7, // fractional
            ]),
            rhsColumn: 2,
            precision: 1e-9,
            variablesPerIndex: [
                undefined,
                { isInteger: true, index: 1, cost: 1 },
                { isInteger: true, index: 2, cost: 2 },
            ],
            varIndexByRow: [0, 1, 2],
            rowByVarIndex: [-1, 1, 2],
            model: {
                integerVariables: [
                    { index: 1, cost: 1 },
                    { index: 2, cost: 2 },
                ],
            },
        });

        const result = isIntegral.call(tableau as never);
        expect(result).toBe(false);
    });

    it("returns true when no integer variables exist", () => {
        const tableau = createMockTableau({
            width: 3,
            height: 2,
            matrix: new Float64Array([0, 0, 0, 0, 0, 5.5]),
            rhsColumn: 2,
            precision: 1e-9,
            variablesPerIndex: [undefined, { isInteger: false, index: 1, cost: 1 }],
            varIndexByRow: [0, 1],
            rowByVarIndex: [-1, 1],
            model: { integerVariables: [] },
        });

        const result = isIntegral.call(tableau as never);
        expect(result).toBe(true);
    });

    it("handles integer variable not in basis (row = -1)", () => {
        const tableau = createMockTableau({
            width: 3,
            height: 2,
            matrix: new Float64Array([0, 0, 0, 0, 0, 5.0]),
            rhsColumn: 2,
            precision: 1e-9,
            variablesPerIndex: [
                undefined,
                { isInteger: true, index: 1, cost: 1 },
                { isInteger: true, index: 2, cost: 2 },
            ],
            varIndexByRow: [0, 1],
            rowByVarIndex: [-1, 1, -1], // var 2 not in basis
            model: {
                integerVariables: [
                    { index: 1, cost: 1 },
                    { index: 2, cost: 2 },
                ],
            },
        });

        const result = isIntegral.call(tableau as never);
        expect(result).toBe(true); // Non-basic variables are assumed to be at bounds (integral)
    });

    it("considers values within precision as integral", () => {
        const precision = 1e-6;
        const tableau = createMockTableau({
            width: 3,
            height: 2,
            matrix: new Float64Array([
                0, 0, 0,
                0, 0, 4.9999999, // Very close to 5
            ]),
            rhsColumn: 2,
            precision,
            variablesPerIndex: [undefined, { isInteger: true, index: 1, cost: 1 }],
            varIndexByRow: [0, 1],
            rowByVarIndex: [-1, 1],
            model: { integerVariables: [{ index: 1, cost: 1 }] },
        });

        const result = isIntegral.call(tableau as never);
        expect(result).toBe(true);
    });
});

describe("computeFractionalVolume", () => {
    it("returns 0 when no integer variables exist", () => {
        const tableau = createMockTableau({
            width: 3,
            height: 2,
            matrix: new Float64Array([0, 0, 0, 0, 0, 5.5]),
            rhsColumn: 2,
            precision: 1e-9,
            variablesPerIndex: [undefined, { isInteger: false, index: 1, cost: 1 }],
            varIndexByRow: [0, 1],
            rowByVarIndex: [-1, 1],
        });

        const result = computeFractionalVolume.call(tableau as never);
        expect(result).toBe(0);
    });

    it("returns 0 when integer variable has integral value (ignoreIntegerValues=false)", () => {
        const tableau = createMockTableau({
            width: 3,
            height: 2,
            matrix: new Float64Array([0, 0, 0, 0, 0, 5.0]),
            rhsColumn: 2,
            precision: 1e-9,
            variablesPerIndex: [undefined, { isInteger: true, index: 1, cost: 1 }],
            varIndexByRow: [0, 1],
            rowByVarIndex: [-1, 1],
        });

        const result = computeFractionalVolume.call(tableau as never, false);
        expect(result).toBe(0);
    });

    it("computes fractional volume for single fractional variable", () => {
        const tableau = createMockTableau({
            width: 3,
            height: 2,
            matrix: new Float64Array([0, 0, 0, 0, 0, 5.5]),
            rhsColumn: 2,
            precision: 1e-9,
            variablesPerIndex: [undefined, { isInteger: true, index: 1, cost: 1 }],
            varIndexByRow: [0, 1],
            rowByVarIndex: [-1, 1],
        });

        const result = computeFractionalVolume.call(tableau as never);
        expect(result).toBe(5.5); // abs(5.5) = 5.5
    });

    it("multiplies volumes for multiple fractional variables", () => {
        const tableau = createMockTableau({
            width: 3,
            height: 3,
            matrix: new Float64Array([
                0, 0, 0,
                0, 0, 2.5, // var 1
                0, 0, 3.5, // var 2
            ]),
            rhsColumn: 2,
            precision: 1e-9,
            variablesPerIndex: [
                undefined,
                { isInteger: true, index: 1, cost: 1 },
                { isInteger: true, index: 2, cost: 2 },
            ],
            varIndexByRow: [0, 1, 2],
            rowByVarIndex: [-1, 1, 2],
        });

        const result = computeFractionalVolume.call(tableau as never);
        expect(result).toBe(2.5 * 3.5); // 8.75
    });

    it("ignores integer values when ignoreIntegerValues=true", () => {
        const tableau = createMockTableau({
            width: 3,
            height: 3,
            matrix: new Float64Array([
                0, 0, 0,
                0, 0, 5.0, // integral
                0, 0, 3.5, // fractional
            ]),
            rhsColumn: 2,
            precision: 1e-9,
            variablesPerIndex: [
                undefined,
                { isInteger: true, index: 1, cost: 1 },
                { isInteger: true, index: 2, cost: 2 },
            ],
            varIndexByRow: [0, 1, 2],
            rowByVarIndex: [-1, 1, 2],
        });

        const result = computeFractionalVolume.call(tableau as never, true);
        expect(result).toBe(3.5); // Only counts the fractional variable
    });

    it("handles negative values correctly", () => {
        const tableau = createMockTableau({
            width: 3,
            height: 2,
            matrix: new Float64Array([0, 0, 0, 0, 0, -2.5]),
            rhsColumn: 2,
            precision: 1e-9,
            variablesPerIndex: [undefined, { isInteger: true, index: 1, cost: 1 }],
            varIndexByRow: [0, 1],
            rowByVarIndex: [-1, 1],
        });

        const result = computeFractionalVolume.call(tableau as never);
        expect(result).toBe(2.5); // Uses absolute value
    });
});

describe("getMostFractionalVar", () => {
    it("returns null index when no integer variables exist", () => {
        const tableau = createMockTableau({
            width: 3,
            height: 2,
            matrix: new Float64Array([0, 0, 0, 0, 0, 5.5]),
            rhsColumn: 2,
            precision: 1e-9,
            variablesPerIndex: [undefined, { isInteger: false, index: 1, cost: 1 }],
            varIndexByRow: [0, 1],
            rowByVarIndex: [-1, 1],
            model: { integerVariables: [] },
        });

        const result = getMostFractionalVar.call(tableau as never);
        expect(result.index).toBeNull();
    });

    it("selects the variable with the largest fractional part", () => {
        const tableau = createMockTableau({
            width: 3,
            height: 3,
            matrix: new Float64Array([
                0, 0, 0,
                0, 0, 5.3, // fraction = 0.3
                0, 0, 3.7, // fraction = 0.3 (from 4)
            ]),
            rhsColumn: 2,
            precision: 1e-9,
            variablesPerIndex: [
                undefined,
                { isInteger: true, index: 1, cost: 1 },
                { isInteger: true, index: 2, cost: 2 },
            ],
            varIndexByRow: [0, 1, 2],
            rowByVarIndex: [-1, 1, 2],
            model: {
                integerVariables: [
                    { index: 1, cost: 1 },
                    { index: 2, cost: 2 },
                ],
            },
        });

        const result = getMostFractionalVar.call(tableau as never);
        // Both have fraction 0.3, but 5.3's distance from round is 0.3, 3.7's is also 0.3
        // First one encountered wins when equal
        expect(result.index).toBe(1);
        expect(result.value).toBe(5.3);
    });

    it("prefers variable closer to 0.5 fractionality", () => {
        const tableau = createMockTableau({
            width: 3,
            height: 3,
            matrix: new Float64Array([
                0, 0, 0,
                0, 0, 5.1, // fraction = 0.1
                0, 0, 3.5, // fraction = 0.5 (most fractional)
            ]),
            rhsColumn: 2,
            precision: 1e-9,
            variablesPerIndex: [
                undefined,
                { isInteger: true, index: 1, cost: 1 },
                { isInteger: true, index: 2, cost: 2 },
            ],
            varIndexByRow: [0, 1, 2],
            rowByVarIndex: [-1, 1, 2],
            model: {
                integerVariables: [
                    { index: 1, cost: 1 },
                    { index: 2, cost: 2 },
                ],
            },
        });

        const result = getMostFractionalVar.call(tableau as never);
        expect(result.index).toBe(2);
        expect(result.value).toBe(3.5);
    });

    it("skips non-basic variables (row = -1)", () => {
        const tableau = createMockTableau({
            width: 3,
            height: 2,
            matrix: new Float64Array([0, 0, 0, 0, 0, 5.3]),
            rhsColumn: 2,
            precision: 1e-9,
            variablesPerIndex: [
                undefined,
                { isInteger: true, index: 1, cost: 1 },
                { isInteger: true, index: 2, cost: 2 },
            ],
            varIndexByRow: [0, 1],
            rowByVarIndex: [-1, 1, -1], // var 2 not in basis
            model: {
                integerVariables: [
                    { index: 1, cost: 1 },
                    { index: 2, cost: 2 },
                ],
            },
        });

        const result = getMostFractionalVar.call(tableau as never);
        expect(result.index).toBe(1);
    });

    it("returns zero value when all variables are integral", () => {
        const tableau = createMockTableau({
            width: 3,
            height: 2,
            matrix: new Float64Array([0, 0, 0, 0, 0, 5.0]),
            rhsColumn: 2,
            precision: 1e-9,
            variablesPerIndex: [undefined, { isInteger: true, index: 1, cost: 1 }],
            varIndexByRow: [0, 1],
            rowByVarIndex: [-1, 1],
            model: { integerVariables: [{ index: 1, cost: 1 }] },
        });

        const result = getMostFractionalVar.call(tableau as never);
        expect(result.index).toBeNull();
        expect(result.value).toBe(0);
    });
});

describe("getFractionalVarWithLowestCost", () => {
    it("returns null when no integer variables exist", () => {
        const tableau = createMockTableau({
            width: 3,
            height: 2,
            matrix: new Float64Array([0, 0, 0, 0, 0, 5.5]),
            rhsColumn: 2,
            precision: 1e-9,
            variablesPerIndex: [undefined, { isInteger: false, index: 1, cost: 1 }],
            varIndexByRow: [0, 1],
            rowByVarIndex: [-1, 1],
            model: { integerVariables: [] },
        });

        const result = getFractionalVarWithLowestCost.call(tableau as never);
        expect(result.index).toBeNull();
        expect(result.value).toBeNull();
    });

    it("selects fractional variable with lowest cost", () => {
        const tableau = createMockTableau({
            width: 3,
            height: 3,
            matrix: new Float64Array([
                0, 0, 0,
                0, 0, 5.5, // var 1: fractional, cost 10
                0, 0, 3.5, // var 2: fractional, cost 2 (lowest)
            ]),
            rhsColumn: 2,
            precision: 1e-9,
            variablesPerIndex: [
                undefined,
                { isInteger: true, index: 1, cost: 10 },
                { isInteger: true, index: 2, cost: 2 },
            ],
            varIndexByRow: [0, 1, 2],
            rowByVarIndex: [-1, 1, 2],
            model: {
                integerVariables: [
                    { index: 1, cost: 10 },
                    { index: 2, cost: 2 },
                ],
            },
        });

        const result = getFractionalVarWithLowestCost.call(tableau as never);
        expect(result.index).toBe(2);
        expect(result.value).toBe(3.5);
    });

    it("skips integral variables when selecting", () => {
        const tableau = createMockTableau({
            width: 3,
            height: 3,
            matrix: new Float64Array([
                0, 0, 0,
                0, 0, 5.0, // var 1: integral, cost 1 (lowest but integral)
                0, 0, 3.5, // var 2: fractional, cost 10
            ]),
            rhsColumn: 2,
            precision: 1e-9,
            variablesPerIndex: [
                undefined,
                { isInteger: true, index: 1, cost: 1 },
                { isInteger: true, index: 2, cost: 10 },
            ],
            varIndexByRow: [0, 1, 2],
            rowByVarIndex: [-1, 1, 2],
            model: {
                integerVariables: [
                    { index: 1, cost: 1 },
                    { index: 2, cost: 10 },
                ],
            },
        });

        const result = getFractionalVarWithLowestCost.call(tableau as never);
        expect(result.index).toBe(2);
        expect(result.value).toBe(3.5);
    });

    it("returns null when all variables are integral", () => {
        const tableau = createMockTableau({
            width: 3,
            height: 2,
            matrix: new Float64Array([0, 0, 0, 0, 0, 5.0]),
            rhsColumn: 2,
            precision: 1e-9,
            variablesPerIndex: [undefined, { isInteger: true, index: 1, cost: 1 }],
            varIndexByRow: [0, 1],
            rowByVarIndex: [-1, 1],
            model: { integerVariables: [{ index: 1, cost: 1 }] },
        });

        const result = getFractionalVarWithLowestCost.call(tableau as never);
        expect(result.index).toBeNull();
        expect(result.value).toBeNull();
    });

    it("skips non-basic variables", () => {
        const tableau = createMockTableau({
            width: 3,
            height: 2,
            matrix: new Float64Array([0, 0, 0, 0, 0, 5.5]),
            rhsColumn: 2,
            precision: 1e-9,
            variablesPerIndex: [
                undefined,
                { isInteger: true, index: 1, cost: 10 },
                { isInteger: true, index: 2, cost: 1 }, // lowest cost but not in basis
            ],
            varIndexByRow: [0, 1],
            rowByVarIndex: [-1, 1, -1],
            model: {
                integerVariables: [
                    { index: 1, cost: 10 },
                    { index: 2, cost: 1 },
                ],
            },
        });

        const result = getFractionalVarWithLowestCost.call(tableau as never);
        expect(result.index).toBe(1);
        expect(result.value).toBe(5.5);
    });
});
