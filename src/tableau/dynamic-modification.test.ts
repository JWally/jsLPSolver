import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    putInBase,
    takeOutOfBase,
    updateVariableValues,
    updateRightHandSide,
    updateConstraintCoefficient,
    updateCost,
    addConstraint,
    removeConstraint,
    addVariable,
    removeVariable,
} from "./dynamic-modification";
import type { Constraint, Variable, Term } from "../expressions";

/**
 * Creates a mock Tableau for testing dynamic modification functions.
 */
function createMockTableau(options?: {
    width?: number;
    height?: number;
    matrix?: Float64Array;
    precision?: number;
}) {
    const width = options?.width ?? 4;
    const height = options?.height ?? 3;

    return {
        width,
        height,
        nVars: width + height - 2,
        matrix: options?.matrix ?? new Float64Array(width * height),
        rhsColumn: 0,
        precision: options?.precision ?? 1e-9,
        variables: [] as Array<{ index: number; value: number; priority: number }>,
        varIndexByRow: Array.from({ length: height }, (_, i) => i),
        varIndexByCol: Array.from({ length: width }, (_, i) => i),
        rowByVarIndex: Array.from({ length: width + height }, (_, i) => (i < height ? i : -1)),
        colByVarIndex: Array.from({ length: width + height }, (_, i) =>
            i < height ? -1 : i - height + 1
        ),
        optionalObjectives: [] as Array<{ reducedCosts: number[] }>,
        objectivesByPriority: {} as Record<number, { reducedCosts: number[] }>,
        availableIndexes: [] as number[],
        model: { isMinimization: true },
        pivot: vi.fn(),
        putInBase: vi.fn().mockReturnValue(1),
        takeOutOfBase: vi.fn().mockReturnValue(1),
        setOptionalObjective: vi.fn(),
    };
}

function createMockConstraint(options: {
    index: number;
    rhs?: number;
    isUpperBound?: boolean;
    terms?: Array<{ coefficient: number; variable: { index: number } }>;
}): Constraint {
    return {
        index: options.index,
        rhs: options.rhs ?? 0,
        isUpperBound: options.isUpperBound ?? true,
        terms: (options.terms ?? []) as Term[],
        slack: { index: options.index },
    } as Constraint;
}

function createMockVariable(options: {
    index: number;
    cost?: number;
    priority?: number;
    value?: number;
}): Variable {
    return {
        index: options.index,
        cost: options.cost ?? 0,
        priority: options.priority ?? 0,
        value: options.value ?? 0,
    } as Variable;
}

describe("putInBase", () => {
    it("returns existing row if variable is already in basis", () => {
        const tableau = createMockTableau();
        tableau.rowByVarIndex = [0, 1, -1, -1];

        const result = putInBase.call(tableau as never, 1);

        expect(result).toBe(1);
        expect(tableau.pivot).not.toHaveBeenCalled();
    });

    it("pivots to bring variable into basis", () => {
        const tableau = createMockTableau();
        tableau.rowByVarIndex = [-1, -1, -1, -1];
        tableau.colByVarIndex = [-1, 1, 2, 3];
        // Set a non-zero coefficient in column 1, row 1
        tableau.matrix[1 * 4 + 1] = 5;

        const result = putInBase.call(tableau as never, 1);

        expect(tableau.pivot).toHaveBeenCalledWith(1, 1);
        expect(result).toBe(1);
    });

    it("finds first row with non-zero coefficient", () => {
        const tableau = createMockTableau({ height: 4 });
        tableau.rowByVarIndex = [-1, -1, -1, -1, -1];
        tableau.colByVarIndex = [-1, 1, 2, 3, 4];
        // Row 1 has zero coefficient, row 2 has non-zero
        tableau.matrix[1 * 4 + 1] = 0;
        tableau.matrix[2 * 4 + 1] = 3;

        putInBase.call(tableau as never, 1);

        expect(tableau.pivot).toHaveBeenCalledWith(2, 1);
    });
});

describe("takeOutOfBase", () => {
    it("returns existing column if variable is not in basis", () => {
        const tableau = createMockTableau();
        tableau.colByVarIndex = [-1, 2, 3, 4];
        tableau.rowByVarIndex = [-1, -1, -1, -1];

        const result = takeOutOfBase.call(tableau as never, 1);

        expect(result).toBe(2);
        expect(tableau.pivot).not.toHaveBeenCalled();
    });

    it("pivots to take variable out of basis", () => {
        const tableau = createMockTableau();
        tableau.colByVarIndex = [-1, -1, 2, 3];
        tableau.rowByVarIndex = [-1, 1, -1, -1];
        // Set a non-zero coefficient in row 1, col 1
        tableau.matrix[1 * 4 + 1] = 5;

        const result = takeOutOfBase.call(tableau as never, 1);

        expect(tableau.pivot).toHaveBeenCalledWith(1, 1);
        expect(result).toBe(1);
    });
});

describe("updateVariableValues", () => {
    it("sets value to 0 for non-basic variables", () => {
        const tableau = createMockTableau();
        const variable = createMockVariable({ index: 1, value: 99 });
        tableau.variables = [variable];
        tableau.rowByVarIndex[1] = -1;

        updateVariableValues.call(tableau as never);

        expect(variable.value).toBe(0);
    });

    it("sets value from matrix for basic variables", () => {
        const tableau = createMockTableau();
        const variable = createMockVariable({ index: 1, value: 0 });
        tableau.variables = [variable];
        tableau.rowByVarIndex[1] = 1;
        tableau.matrix[1 * 4 + 0] = 5.0; // RHS for row 1

        updateVariableValues.call(tableau as never);

        expect(variable.value).toBe(5);
    });

    it("rounds values according to precision", () => {
        const tableau = createMockTableau({ precision: 1e-6 });
        const variable = createMockVariable({ index: 1 });
        tableau.variables = [variable];
        tableau.rowByVarIndex[1] = 1;
        tableau.matrix[1 * 4 + 0] = 5.0000001;

        updateVariableValues.call(tableau as never);

        expect(variable.value).toBe(5);
    });
});

describe("updateRightHandSide", () => {
    it("updates RHS when constraint is in basis", () => {
        const tableau = createMockTableau();
        const constraint = createMockConstraint({ index: 1 });
        tableau.rowByVarIndex[1] = 1;
        tableau.matrix[1 * 4 + 0] = 10;

        updateRightHandSide.call(tableau as never, constraint, 3);

        expect(tableau.matrix[1 * 4 + 0]).toBe(7); // 10 - 3
    });

    it("updates all rows when constraint is not in basis", () => {
        const tableau = createMockTableau({ height: 3 });
        const constraint = createMockConstraint({ index: 1 });
        tableau.rowByVarIndex[1] = -1;
        tableau.colByVarIndex[1] = 2;
        // Set up matrix values
        tableau.matrix[0 * 4 + 0] = 10; // RHS row 0
        tableau.matrix[0 * 4 + 2] = 2; // slack col row 0
        tableau.matrix[1 * 4 + 0] = 20;
        tableau.matrix[1 * 4 + 2] = 3;
        tableau.matrix[2 * 4 + 0] = 30;
        tableau.matrix[2 * 4 + 2] = 4;

        updateRightHandSide.call(tableau as never, constraint, 1);

        expect(tableau.matrix[0 * 4 + 0]).toBe(8); // 10 - 1*2
        expect(tableau.matrix[1 * 4 + 0]).toBe(17); // 20 - 1*3
        expect(tableau.matrix[2 * 4 + 0]).toBe(26); // 30 - 1*4
    });

    it("updates optional objectives when constraint is not in basis", () => {
        const tableau = createMockTableau();
        const constraint = createMockConstraint({ index: 1 });
        tableau.rowByVarIndex[1] = -1;
        tableau.colByVarIndex[1] = 2;
        tableau.optionalObjectives = [{ reducedCosts: [10, 0, 5, 0] }];
        tableau.matrix[0 * 4 + 2] = 2; // slack col row 0

        updateRightHandSide.call(tableau as never, constraint, 1);

        expect(tableau.optionalObjectives[0].reducedCosts[0]).toBe(5); // 10 - 1*5
    });
});

describe("updateConstraintCoefficient", () => {
    it("throws error when constraint index equals variable index", () => {
        const tableau = createMockTableau();
        const constraint = createMockConstraint({ index: 1 });
        const variable = createMockVariable({ index: 1 });

        expect(() => {
            updateConstraintCoefficient.call(tableau as never, constraint, variable, 1);
        }).toThrow("constraint index should not be equal to variable index");
    });

    it("updates coefficient when variable is not in basis", () => {
        const tableau = createMockTableau();
        const constraint = createMockConstraint({ index: 1 });
        const variable = createMockVariable({ index: 2 });
        tableau.colByVarIndex[2] = 2;
        tableau.putInBase = vi.fn().mockReturnValue(1);

        updateConstraintCoefficient.call(tableau as never, constraint, variable, 3);

        expect(tableau.matrix[1 * 4 + 2]).toBe(-3);
    });

    it("updates row when variable is in basis", () => {
        const tableau = createMockTableau();
        const constraint = createMockConstraint({ index: 1 });
        const variable = createMockVariable({ index: 2 });
        tableau.colByVarIndex[2] = -1;
        tableau.rowByVarIndex[2] = 2;
        tableau.putInBase = vi.fn().mockReturnValue(1);
        // Set up variable row values
        tableau.matrix[2 * 4 + 0] = 1;
        tableau.matrix[2 * 4 + 1] = 2;
        tableau.matrix[2 * 4 + 2] = 3;
        tableau.matrix[2 * 4 + 3] = 4;

        updateConstraintCoefficient.call(tableau as never, constraint, variable, 2);

        // Row 1 should be updated by adding 2 * row 2
        expect(tableau.matrix[1 * 4 + 0]).toBe(2);
        expect(tableau.matrix[1 * 4 + 1]).toBe(4);
    });
});

describe("updateCost", () => {
    it("updates cost row when variable is not in basis (priority 0)", () => {
        const tableau = createMockTableau();
        const variable = createMockVariable({ index: 1, priority: 0 });
        tableau.colByVarIndex[1] = 2;

        updateCost.call(tableau as never, variable, 5);

        expect(tableau.matrix[2]).toBe(-5); // row 0, col 2
    });

    it("updates cost row when variable is in basis (priority 0)", () => {
        const tableau = createMockTableau();
        const variable = createMockVariable({ index: 1, priority: 0 });
        tableau.colByVarIndex[1] = -1;
        tableau.rowByVarIndex[1] = 1;
        tableau.matrix[1 * 4 + 0] = 2;
        tableau.matrix[1 * 4 + 1] = 3;
        tableau.matrix[1 * 4 + 2] = 4;
        tableau.matrix[1 * 4 + 3] = 5;

        updateCost.call(tableau as never, variable, 2);

        // Cost row should be updated by adding 2 * row 1
        expect(tableau.matrix[0]).toBe(4);
        expect(tableau.matrix[1]).toBe(6);
    });

    it("updates optional objective when variable has priority > 0 and is in basis", () => {
        const tableau = createMockTableau();
        const variable = createMockVariable({ index: 1, priority: 1 });
        tableau.colByVarIndex[1] = -1;
        tableau.rowByVarIndex[1] = 1;
        tableau.objectivesByPriority = { 1: { reducedCosts: [0, 0, 0, 0] } };
        tableau.matrix[1 * 4 + 0] = 2;
        tableau.matrix[1 * 4 + 1] = 3;

        updateCost.call(tableau as never, variable, 2);

        expect(tableau.objectivesByPriority[1].reducedCosts[0]).toBe(4);
        expect(tableau.objectivesByPriority[1].reducedCosts[1]).toBe(6);
    });
});

describe("addConstraint", () => {
    it("adds new row to matrix", () => {
        const tableau = createMockTableau({ width: 4, height: 3 });
        const constraint = createMockConstraint({
            index: 10,
            rhs: 5,
            isUpperBound: true,
            terms: [],
        });

        addConstraint.call(tableau as never, constraint);

        expect(tableau.height).toBe(4);
        expect(tableau.matrix[3 * 4 + 0]).toBe(5); // RHS
    });

    it("handles lower bound constraints with negated sign", () => {
        const tableau = createMockTableau({ width: 4, height: 3 });
        const constraint = createMockConstraint({
            index: 10,
            rhs: 5,
            isUpperBound: false,
            terms: [],
        });

        addConstraint.call(tableau as never, constraint);

        expect(tableau.matrix[3 * 4 + 0]).toBe(-5); // Negated RHS
    });

    it("processes terms for non-basic variables", () => {
        const tableau = createMockTableau({ width: 4, height: 3 });
        tableau.rowByVarIndex = [-1, -1, -1, -1, -1, -1];
        tableau.colByVarIndex = [-1, 1, 2, 3, 4, 5];
        const constraint = createMockConstraint({
            index: 10,
            rhs: 10,
            isUpperBound: true,
            terms: [{ coefficient: 3, variable: { index: 1 } }],
        });

        addConstraint.call(tableau as never, constraint);

        expect(tableau.matrix[3 * 4 + 1]).toBe(3); // Coefficient in col 1
    });

    it("processes terms for basic variables", () => {
        const tableau = createMockTableau({ width: 4, height: 3 });
        tableau.rowByVarIndex = [-1, 1, -1, -1];
        tableau.colByVarIndex = [-1, -1, 2, 3];
        // Variable 1 is in row 1
        tableau.matrix[1 * 4 + 0] = 2;
        tableau.matrix[1 * 4 + 1] = 3;
        tableau.matrix[1 * 4 + 2] = 4;
        tableau.matrix[1 * 4 + 3] = 5;
        const constraint = createMockConstraint({
            index: 10,
            rhs: 10,
            isUpperBound: true,
            terms: [{ coefficient: 2, variable: { index: 1 } }],
        });

        addConstraint.call(tableau as never, constraint);

        // New row should subtract 2 * row 1
        expect(tableau.matrix[3 * 4 + 0]).toBe(10 - 2 * 2); // 6
    });

    it("grows matrix if capacity exceeded", () => {
        const tableau = createMockTableau({ width: 4, height: 3 });
        tableau.matrix = new Float64Array(12); // Exactly 3 rows
        const constraint = createMockConstraint({ index: 10, rhs: 5, isUpperBound: true, terms: [] });

        addConstraint.call(tableau as never, constraint);

        expect(tableau.matrix.length).toBeGreaterThan(12);
    });

    it("updates varIndexByRow and rowByVarIndex", () => {
        const tableau = createMockTableau();
        const constraint = createMockConstraint({ index: 10, rhs: 5, isUpperBound: true, terms: [] });

        addConstraint.call(tableau as never, constraint);

        expect(tableau.varIndexByRow[3]).toBe(10);
        expect(tableau.rowByVarIndex[10]).toBe(3);
        expect(tableau.colByVarIndex[10]).toBe(-1);
    });
});

describe("removeConstraint", () => {
    it("removes constraint by swapping with last row", () => {
        const tableau = createMockTableau({ width: 4, height: 4 });
        const constraint = createMockConstraint({ index: 1 });
        tableau.putInBase = vi.fn().mockReturnValue(1);
        // Set up matrix values
        tableau.matrix[1 * 4 + 0] = 10;
        tableau.matrix[3 * 4 + 0] = 30;

        removeConstraint.call(tableau as never, constraint);

        // Row 1 should now have the values from row 3
        expect(tableau.matrix[1 * 4 + 0]).toBe(30);
        expect(tableau.height).toBe(3);
    });

    it("updates rowByVarIndex", () => {
        const tableau = createMockTableau({ width: 4, height: 4 });
        const constraint = createMockConstraint({ index: 1 });
        tableau.putInBase = vi.fn().mockReturnValue(1);

        removeConstraint.call(tableau as never, constraint);

        expect(tableau.rowByVarIndex[1]).toBe(-1);
    });

    it("adds index to availableIndexes", () => {
        const tableau = createMockTableau();
        const constraint = createMockConstraint({ index: 5 });
        tableau.putInBase = vi.fn().mockReturnValue(1);

        removeConstraint.call(tableau as never, constraint);

        expect(tableau.availableIndexes).toContain(5);
    });

    it("sets slack index to -1", () => {
        const tableau = createMockTableau();
        const constraint = createMockConstraint({ index: 5 });
        tableau.putInBase = vi.fn().mockReturnValue(1);

        removeConstraint.call(tableau as never, constraint);

        expect(constraint.slack.index).toBe(-1);
    });
});

describe("addVariable", () => {
    it("expands matrix width by 1", () => {
        const tableau = createMockTableau({ width: 4, height: 3 });
        const variable = createMockVariable({ index: 10, cost: 5, priority: 0 });

        addVariable.call(tableau as never, variable);

        expect(tableau.width).toBe(5);
    });

    it("sets cost in row 0 for priority 0", () => {
        const tableau = createMockTableau({ width: 4, height: 3 });
        tableau.model.isMinimization = true;
        const variable = createMockVariable({ index: 10, cost: 5, priority: 0 });

        addVariable.call(tableau as never, variable);

        expect(tableau.matrix[4]).toBe(-5); // Negated for minimization
    });

    it("negates cost for minimization", () => {
        const tableau = createMockTableau({ width: 4, height: 3 });
        tableau.model.isMinimization = true;
        const variable = createMockVariable({ index: 10, cost: 5, priority: 0 });

        addVariable.call(tableau as never, variable);

        expect(tableau.matrix[4]).toBe(-5);
    });

    it("does not negate cost for maximization", () => {
        const tableau = createMockTableau({ width: 4, height: 3 });
        tableau.model.isMinimization = false;
        const variable = createMockVariable({ index: 10, cost: 5, priority: 0 });

        addVariable.call(tableau as never, variable);

        expect(tableau.matrix[4]).toBe(5);
    });

    it("calls setOptionalObjective for priority > 0", () => {
        const tableau = createMockTableau({ width: 4, height: 3 });
        const variable = createMockVariable({ index: 10, cost: 5, priority: 1 });

        addVariable.call(tableau as never, variable);

        expect(tableau.setOptionalObjective).toHaveBeenCalledWith(1, 4, -5);
    });

    it("updates varIndexByCol and colByVarIndex", () => {
        const tableau = createMockTableau({ width: 4, height: 3 });
        const variable = createMockVariable({ index: 10, cost: 5, priority: 0 });

        addVariable.call(tableau as never, variable);

        expect(tableau.colByVarIndex[10]).toBe(4);
        expect(tableau.varIndexByCol[4]).toBe(10);
    });

    it("extends optional objectives reducedCosts", () => {
        const tableau = createMockTableau({ width: 4, height: 3 });
        tableau.optionalObjectives = [{ reducedCosts: [0, 0, 0, 0] }];
        const variable = createMockVariable({ index: 10, cost: 5, priority: 0 });

        addVariable.call(tableau as never, variable);

        expect(tableau.optionalObjectives[0].reducedCosts[4]).toBe(0);
    });
});

describe("removeVariable", () => {
    it("reduces matrix width by 1", () => {
        const tableau = createMockTableau({ width: 5, height: 3 });
        const variable = createMockVariable({ index: 2 });
        tableau.takeOutOfBase = vi.fn().mockReturnValue(2);

        removeVariable.call(tableau as never, variable);

        expect(tableau.width).toBe(4);
    });

    it("swaps column with last column", () => {
        const tableau = createMockTableau({ width: 5, height: 3 });
        const variable = createMockVariable({ index: 2 });
        tableau.takeOutOfBase = vi.fn().mockReturnValue(2);
        // Set up values
        tableau.matrix[0 * 5 + 2] = 10;
        tableau.matrix[0 * 5 + 4] = 40;
        tableau.matrix[1 * 5 + 2] = 20;
        tableau.matrix[1 * 5 + 4] = 50;

        removeVariable.call(tableau as never, variable);

        // Column 2 should now have values from column 4
        expect(tableau.matrix[0 * 5 + 2]).toBe(40);
        expect(tableau.matrix[1 * 5 + 2]).toBe(50);
    });

    it("updates index mappings", () => {
        const tableau = createMockTableau({ width: 5, height: 3 });
        const variable = createMockVariable({ index: 2 });
        tableau.takeOutOfBase = vi.fn().mockReturnValue(2);
        tableau.varIndexByCol[4] = 5;

        removeVariable.call(tableau as never, variable);

        expect(tableau.rowByVarIndex[2]).toBe(-1);
        expect(tableau.colByVarIndex[2]).toBe(-1);
        expect(tableau.varIndexByCol[2]).toBe(5);
    });

    it("adds index to availableIndexes", () => {
        const tableau = createMockTableau({ width: 5, height: 3 });
        const variable = createMockVariable({ index: 7 });
        tableau.takeOutOfBase = vi.fn().mockReturnValue(2);

        removeVariable.call(tableau as never, variable);

        expect(tableau.availableIndexes).toContain(7);
    });
});
