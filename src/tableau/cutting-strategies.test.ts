import { describe, it, expect, vi } from "vitest";
import {
    addCutConstraints,
    addLowerBoundMIRCut,
    addUpperBoundMIRCut,
    applyMIRCuts,
} from "./cutting-strategies";
import type { BranchCut } from "./types";

/**
 * Creates a mock Tableau for testing cutting strategies.
 */
function createMockTableau(options?: {
    width?: number;
    height?: number;
    matrix?: Float64Array;
    precision?: number;
    costRowIndex?: number;
}) {
    const width = options?.width ?? 4;
    const height = options?.height ?? 3;

    let elementIndex = 10;

    return {
        width,
        height,
        nVars: width + height - 2,
        matrix: options?.matrix ?? new Float64Array(width * height),
        rhsColumn: 0,
        precision: options?.precision ?? 1e-9,
        costRowIndex: options?.costRowIndex ?? 0,
        varIndexByRow: Array.from({ length: height }, (_, i) => i),
        varIndexByCol: Array.from({ length: width }, (_, i) => i),
        rowByVarIndex: Array.from({ length: width + height }, (_, i) => (i < height ? i : -1)),
        colByVarIndex: Array.from({ length: width + height }, (_, i) =>
            i < height ? -1 : i - height + 1
        ),
        variablesPerIndex: [] as Array<
            { id: string; isInteger?: boolean; isSlack?: boolean } | undefined
        >,
        getNewElementIndex: vi.fn(() => elementIndex++),
        addLowerBoundMIRCut: vi.fn(),
    };
}

describe("addCutConstraints", () => {
    it("adds a single min cut constraint", () => {
        const tableau = createMockTableau({ width: 4, height: 2 });
        tableau.rowByVarIndex = [-1, 1, -1, -1, -1, -1];
        tableau.colByVarIndex = [-1, -1, 2, 3, 4, 5];

        const cuts: BranchCut[] = [{ type: "min", varIndex: 2, value: 5 }];

        addCutConstraints.call(tableau as never, cuts);

        expect(tableau.height).toBe(3);
        expect(tableau.varIndexByRow[2]).toBe(10);
    });

    it("adds a single max cut constraint", () => {
        const tableau = createMockTableau({ width: 4, height: 2 });
        tableau.rowByVarIndex = [-1, 1, -1, -1, -1, -1];
        tableau.colByVarIndex = [-1, -1, 2, 3, 4, 5];

        const cuts: BranchCut[] = [{ type: "max", varIndex: 2, value: 10 }];

        addCutConstraints.call(tableau as never, cuts);

        expect(tableau.height).toBe(3);
    });

    it("handles variable in basis (rowByVarIndex != -1)", () => {
        const tableau = createMockTableau({ width: 4, height: 2 });
        // Variable 1 is in row 1
        tableau.rowByVarIndex = [-1, 1, -1, -1];
        tableau.colByVarIndex = [-1, -1, 2, 3];
        // Set RHS for row 1
        tableau.matrix[1 * 4 + 0] = 3; // varValue = 3

        const cuts: BranchCut[] = [{ type: "min", varIndex: 1, value: 5 }];

        addCutConstraints.call(tableau as never, cuts);

        expect(tableau.height).toBe(3);
        // Check that cut was applied with sign * (cut.value - varValue)
        expect(tableau.matrix[2 * 4 + 0]).toBe(-1 * (5 - 3)); // -2
    });

    it("handles variable not in basis", () => {
        const tableau = createMockTableau({ width: 4, height: 2 });
        tableau.rowByVarIndex = [-1, -1, -1, -1, -1, -1];
        tableau.colByVarIndex = [-1, 1, 2, 3, 4, 5];

        const cuts: BranchCut[] = [{ type: "min", varIndex: 1, value: 5 }];

        addCutConstraints.call(tableau as never, cuts);

        expect(tableau.height).toBe(3);
        expect(tableau.matrix[2 * 4 + 0]).toBe(-5); // sign * cut.value for min
    });

    it("adds multiple cut constraints", () => {
        const tableau = createMockTableau({ width: 4, height: 2 });
        tableau.rowByVarIndex = [-1, -1, -1, -1, -1, -1, -1, -1];
        tableau.colByVarIndex = [-1, 1, 2, 3, 4, 5, 6, 7];

        const cuts: BranchCut[] = [
            { type: "min", varIndex: 1, value: 5 },
            { type: "max", varIndex: 2, value: 10 },
        ];

        addCutConstraints.call(tableau as never, cuts);

        expect(tableau.height).toBe(4);
    });

    it("grows matrix if needed", () => {
        const tableau = createMockTableau({ width: 4, height: 2 });
        tableau.matrix = new Float64Array(8); // Exactly fits 2 rows
        tableau.rowByVarIndex = [-1, -1, -1, -1];
        tableau.colByVarIndex = [-1, 1, 2, 3];

        const cuts: BranchCut[] = [{ type: "min", varIndex: 1, value: 5 }];

        addCutConstraints.call(tableau as never, cuts);

        expect(tableau.matrix.length).toBeGreaterThanOrEqual(12); // 3 rows * 4 cols
    });

    it("creates slack variable for each cut", () => {
        const tableau = createMockTableau({ width: 4, height: 2 });
        tableau.rowByVarIndex = [-1, -1, -1, -1];
        tableau.colByVarIndex = [-1, 1, 2, 3];

        const cuts: BranchCut[] = [{ type: "min", varIndex: 1, value: 5 }];

        addCutConstraints.call(tableau as never, cuts);

        expect(tableau.variablesPerIndex[10]).toBeDefined();
        expect(tableau.variablesPerIndex[10]?.isSlack).toBe(true);
    });
});

describe("addLowerBoundMIRCut", () => {
    it("returns false for cost row", () => {
        const tableau = createMockTableau({ costRowIndex: 0 });

        const result = addLowerBoundMIRCut.call(tableau as never, 0);

        expect(result).toBe(false);
    });

    it("returns false when variable is undefined", () => {
        const tableau = createMockTableau();
        tableau.variablesPerIndex[1] = undefined;

        const result = addLowerBoundMIRCut.call(tableau as never, 1);

        expect(result).toBe(false);
    });

    it("returns false when variable is not integer", () => {
        const tableau = createMockTableau();
        tableau.variablesPerIndex[1] = { id: "x", isInteger: false };

        const result = addLowerBoundMIRCut.call(tableau as never, 1);

        expect(result).toBe(false);
    });

    it("returns false when RHS is integral", () => {
        const tableau = createMockTableau({ width: 4, height: 3 });
        tableau.variablesPerIndex[1] = { id: "x", isInteger: true };
        tableau.matrix[1 * 4 + 0] = 5.0; // Integral value

        const result = addLowerBoundMIRCut.call(tableau as never, 1);

        expect(result).toBe(false);
    });

    it("returns true and adds cut when RHS is fractional", () => {
        const tableau = createMockTableau({ width: 4, height: 3 });
        tableau.variablesPerIndex[1] = { id: "x", isInteger: true };
        tableau.varIndexByCol = [0, 2, 3, 4];
        tableau.variablesPerIndex[2] = { id: "y", isInteger: true };
        tableau.variablesPerIndex[3] = { id: "z", isInteger: false };
        tableau.matrix[1 * 4 + 0] = 5.3; // Fractional value

        const result = addLowerBoundMIRCut.call(tableau as never, 1);

        expect(result).toBe(true);
        expect(tableau.height).toBe(4);
    });

    it("grows matrix if needed", () => {
        const tableau = createMockTableau({ width: 4, height: 3 });
        tableau.matrix = new Float64Array(12); // Exactly fits 3 rows
        tableau.variablesPerIndex[1] = { id: "x", isInteger: true };
        tableau.varIndexByCol = [0, 2, 3, 4];
        tableau.variablesPerIndex[2] = { id: "y" };
        tableau.variablesPerIndex[3] = { id: "z" };
        tableau.matrix[1 * 4 + 0] = 5.3;

        addLowerBoundMIRCut.call(tableau as never, 1);

        expect(tableau.matrix.length).toBeGreaterThanOrEqual(16);
    });

    it("handles near-integral values as integral", () => {
        const tableau = createMockTableau({ width: 4, height: 3, precision: 1e-6 });
        tableau.variablesPerIndex[1] = { id: "x", isInteger: true };
        tableau.matrix[1 * 4 + 0] = 5.0000001; // Very close to integral

        const result = addLowerBoundMIRCut.call(tableau as never, 1);

        expect(result).toBe(false);
    });
});

describe("addUpperBoundMIRCut", () => {
    it("returns false for cost row", () => {
        const tableau = createMockTableau({ costRowIndex: 0 });

        const result = addUpperBoundMIRCut.call(tableau as never, 0);

        expect(result).toBe(false);
    });

    it("returns false when variable is undefined", () => {
        const tableau = createMockTableau();
        tableau.variablesPerIndex[1] = undefined;

        const result = addUpperBoundMIRCut.call(tableau as never, 1);

        expect(result).toBe(false);
    });

    it("returns false when variable is not integer", () => {
        const tableau = createMockTableau();
        tableau.variablesPerIndex[1] = { id: "x", isInteger: false };

        const result = addUpperBoundMIRCut.call(tableau as never, 1);

        expect(result).toBe(false);
    });

    it("returns false when RHS is integral", () => {
        const tableau = createMockTableau({ width: 4, height: 3 });
        tableau.variablesPerIndex[1] = { id: "x", isInteger: true };
        tableau.matrix[1 * 4 + 0] = 5.0;

        const result = addUpperBoundMIRCut.call(tableau as never, 1);

        expect(result).toBe(false);
    });

    it("returns true and adds cut when RHS is fractional", () => {
        const tableau = createMockTableau({ width: 4, height: 3 });
        tableau.variablesPerIndex[1] = { id: "x", isInteger: true };
        tableau.varIndexByCol = [0, 2, 3, 4];
        tableau.variablesPerIndex[2] = { id: "y", isInteger: true };
        tableau.variablesPerIndex[3] = { id: "z", isInteger: false };
        tableau.matrix[1 * 4 + 0] = 5.3;
        tableau.matrix[1 * 4 + 1] = 2.5; // coefficient for col 1
        tableau.matrix[1 * 4 + 2] = -1.5; // negative coefficient

        const result = addUpperBoundMIRCut.call(tableau as never, 1);

        expect(result).toBe(true);
        expect(tableau.height).toBe(4);
    });

    it("handles integer variable with termCoeff <= fractionalPart", () => {
        const tableau = createMockTableau({ width: 4, height: 3 });
        tableau.variablesPerIndex[1] = { id: "x", isInteger: true };
        tableau.varIndexByCol = [0, 2, 3, 4];
        tableau.variablesPerIndex[2] = { id: "y", isInteger: true };
        tableau.matrix[1 * 4 + 0] = 5.7; // fractionalPart = 0.7
        tableau.matrix[1 * 4 + 1] = 1.2; // termCoeff = 0.2 <= 0.7

        addUpperBoundMIRCut.call(tableau as never, 1);

        expect(tableau.height).toBe(4);
    });

    it("handles integer variable with termCoeff > fractionalPart", () => {
        const tableau = createMockTableau({ width: 4, height: 3 });
        tableau.variablesPerIndex[1] = { id: "x", isInteger: true };
        tableau.varIndexByCol = [0, 2, 3, 4];
        tableau.variablesPerIndex[2] = { id: "y", isInteger: true };
        tableau.matrix[1 * 4 + 0] = 5.2; // fractionalPart = 0.2
        tableau.matrix[1 * 4 + 1] = 1.5; // termCoeff = 0.5 > 0.2

        addUpperBoundMIRCut.call(tableau as never, 1);

        expect(tableau.height).toBe(4);
    });

    it("handles continuous variable with positive coefficient", () => {
        const tableau = createMockTableau({ width: 4, height: 3 });
        tableau.variablesPerIndex[1] = { id: "x", isInteger: true };
        tableau.varIndexByCol = [0, 2, 3, 4];
        tableau.variablesPerIndex[2] = { id: "y", isInteger: false };
        tableau.matrix[1 * 4 + 0] = 5.3;
        tableau.matrix[1 * 4 + 1] = 2.0; // positive

        addUpperBoundMIRCut.call(tableau as never, 1);

        expect(tableau.height).toBe(4);
    });

    it("handles continuous variable with negative coefficient", () => {
        const tableau = createMockTableau({ width: 4, height: 3 });
        tableau.variablesPerIndex[1] = { id: "x", isInteger: true };
        tableau.varIndexByCol = [0, 2, 3, 4];
        tableau.variablesPerIndex[2] = { id: "y", isInteger: false };
        tableau.matrix[1 * 4 + 0] = 5.3;
        tableau.matrix[1 * 4 + 1] = -2.0; // negative

        addUpperBoundMIRCut.call(tableau as never, 1);

        expect(tableau.height).toBe(4);
    });

    it("grows matrix if needed", () => {
        const tableau = createMockTableau({ width: 4, height: 3 });
        tableau.matrix = new Float64Array(12);
        tableau.variablesPerIndex[1] = { id: "x", isInteger: true };
        tableau.varIndexByCol = [0, 2, 3, 4];
        tableau.variablesPerIndex[2] = { id: "y" };
        tableau.matrix[1 * 4 + 0] = 5.3;

        addUpperBoundMIRCut.call(tableau as never, 1);

        expect(tableau.matrix.length).toBeGreaterThanOrEqual(16);
    });
});

describe("applyMIRCuts", () => {
    it("calls addLowerBoundMIRCut for each row except cost row", () => {
        const tableau = createMockTableau({ height: 4 });
        tableau.addLowerBoundMIRCut = vi.fn().mockReturnValue(false);

        applyMIRCuts.call(tableau as never);

        // Should be called for rows 1, 2, 3 (not row 0 which is cost row)
        expect(tableau.addLowerBoundMIRCut).toHaveBeenCalledTimes(3);
    });

    it("stops after maxCuts (10) cuts added", () => {
        const tableau = createMockTableau({ height: 20 });
        let callCount = 0;
        tableau.addLowerBoundMIRCut = vi.fn().mockImplementation(() => {
            callCount++;
            return true; // Always succeeds
        });

        applyMIRCuts.call(tableau as never);

        expect(callCount).toBe(10);
    });

    it("continues if cut not added", () => {
        const tableau = createMockTableau({ height: 5 });
        const results = [false, true, false, true];
        let idx = 0;
        tableau.addLowerBoundMIRCut = vi.fn().mockImplementation(() => results[idx++]);

        applyMIRCuts.call(tableau as never);

        expect(tableau.addLowerBoundMIRCut).toHaveBeenCalledTimes(4);
    });
});
