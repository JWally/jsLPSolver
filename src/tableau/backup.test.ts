import { describe, it, expect, vi } from "vitest";
import { copy, save, restore } from "./backup";

/**
 * Creates a mock Tableau for testing backup functions.
 */
function createMockTableau(options?: {
    width?: number;
    height?: number;
    nVars?: number;
    optionalObjectives?: Array<{ reducedCosts: number[]; priority: number; copy: () => unknown }>;
}) {
    const width = options?.width ?? 4;
    const height = options?.height ?? 3;
    const nVars = options?.nVars ?? 5;

    const MockConstructor = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
        // Initialize empty properties that copy() will fill
        this.width = 0;
        this.height = 0;
        this.nVars = 0;
        this.model = null;
        this.variables = [];
        this.variablesPerIndex = [];
        this.unrestrictedVars = {};
        this.lastElementIndex = 0;
        this.varIndexByRow = [];
        this.varIndexByCol = [];
        this.rowByVarIndex = [];
        this.colByVarIndex = [];
        this.availableIndexes = [];
        this.optionalObjectives = [];
        this.objectivesByPriority = {};
        this.optionalObjectivePerPriority = {};
        this.matrix = new Float64Array(0);
        return this;
    });

    return {
        constructor: MockConstructor,
        precision: 1e-9,
        branchAndCutService: { name: "test-service" },
        width,
        height,
        nVars,
        model: { name: "test-model" },
        variables: [{ id: "x" }, { id: "y" }],
        variablesPerIndex: [undefined, { id: "x" }, { id: "y" }],
        unrestrictedVars: { 1: true },
        lastElementIndex: 10,
        varIndexByRow: [0, 1, 2],
        varIndexByCol: [0, 1, 2, 3],
        rowByVarIndex: [-1, 1, 2, -1, -1],
        colByVarIndex: [0, -1, -1, 3, 4],
        availableIndexes: [5, 6],
        optionalObjectives: options?.optionalObjectives ?? [],
        objectivesByPriority: {},
        optionalObjectivePerPriority: {},
        matrix: new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
        savedState: null,
        copy: null as unknown,
    };
}

describe("copy", () => {
    it("creates a new tableau instance with same constructor", () => {
        const tableau = createMockTableau();

        const result = copy.call(tableau as never);

        expect(tableau.constructor).toHaveBeenCalledWith(tableau.precision, tableau.branchAndCutService);
        expect(result).toBeDefined();
    });

    it("copies dimensions", () => {
        const tableau = createMockTableau({ width: 5, height: 4 });

        const result = copy.call(tableau as never);

        expect(result.width).toBe(5);
        expect(result.height).toBe(4);
    });

    it("copies nVars and model reference", () => {
        const tableau = createMockTableau({ nVars: 10 });

        const result = copy.call(tableau as never);

        expect(result.nVars).toBe(10);
        expect(result.model).toBe(tableau.model);
    });

    it("shares variables and variablesPerIndex arrays (not deep copied)", () => {
        const tableau = createMockTableau();

        const result = copy.call(tableau as never);

        expect(result.variables).toBe(tableau.variables);
        expect(result.variablesPerIndex).toBe(tableau.variablesPerIndex);
    });

    it("shares unrestrictedVars object", () => {
        const tableau = createMockTableau();

        const result = copy.call(tableau as never);

        expect(result.unrestrictedVars).toBe(tableau.unrestrictedVars);
    });

    it("creates new copies of index arrays", () => {
        const tableau = createMockTableau();

        const result = copy.call(tableau as never);

        expect(result.varIndexByRow).toEqual(tableau.varIndexByRow);
        expect(result.varIndexByRow).not.toBe(tableau.varIndexByRow);

        expect(result.varIndexByCol).toEqual(tableau.varIndexByCol);
        expect(result.varIndexByCol).not.toBe(tableau.varIndexByCol);

        expect(result.rowByVarIndex).toEqual(tableau.rowByVarIndex);
        expect(result.rowByVarIndex).not.toBe(tableau.rowByVarIndex);

        expect(result.colByVarIndex).toEqual(tableau.colByVarIndex);
        expect(result.colByVarIndex).not.toBe(tableau.colByVarIndex);
    });

    it("creates new copy of availableIndexes", () => {
        const tableau = createMockTableau();

        const result = copy.call(tableau as never);

        expect(result.availableIndexes).toEqual(tableau.availableIndexes);
        expect(result.availableIndexes).not.toBe(tableau.availableIndexes);
    });

    it("copies optional objectives by calling their copy method", () => {
        const optObj = {
            reducedCosts: [1, 2, 3],
            priority: 1,
            copy: vi.fn().mockReturnValue({ reducedCosts: [1, 2, 3], priority: 1 }),
        };
        const tableau = createMockTableau({ optionalObjectives: [optObj] });

        const result = copy.call(tableau as never);

        expect(optObj.copy).toHaveBeenCalled();
        expect(result.optionalObjectives).toHaveLength(1);
    });

    it("creates shallow copy of objectivesByPriority", () => {
        const tableau = createMockTableau();
        tableau.objectivesByPriority = { 1: { priority: 1 } };

        const result = copy.call(tableau as never);

        expect(result.objectivesByPriority).toEqual(tableau.objectivesByPriority);
        expect(result.objectivesByPriority).not.toBe(tableau.objectivesByPriority);
    });

    it("creates new Float64Array copy of matrix", () => {
        const tableau = createMockTableau();
        tableau.matrix = new Float64Array([1, 2, 3, 4]);

        const result = copy.call(tableau as never);

        expect(result.matrix).toEqual(tableau.matrix);
        expect(result.matrix).not.toBe(tableau.matrix);
        expect(result.matrix).toBeInstanceOf(Float64Array);
    });
});

describe("save", () => {
    it("creates a copy and stores it in savedState", () => {
        const tableau = createMockTableau();
        // Add copy method that save() will call
        tableau.copy = vi.fn().mockReturnValue({ isCopy: true });

        save.call(tableau as never);

        expect(tableau.copy).toHaveBeenCalled();
        expect(tableau.savedState).toEqual({ isCopy: true });
    });
});

describe("restore", () => {
    it("does nothing when savedState is null", () => {
        const tableau = createMockTableau();
        tableau.savedState = null;
        const originalWidth = tableau.width;

        restore.call(tableau as never);

        expect(tableau.width).toBe(originalWidth);
    });

    it("restores basic properties from savedState", () => {
        const tableau = createMockTableau({ width: 4, height: 3, nVars: 5 });
        tableau.savedState = {
            width: 6,
            height: 5,
            nVars: 10,
            model: { name: "saved-model" },
            variables: [{ id: "a" }],
            variablesPerIndex: [undefined, { id: "a" }],
            unrestrictedVars: { 2: true },
            lastElementIndex: 20,
            matrix: new Float64Array([1, 2, 3, 4, 5, 6]),
            varIndexByRow: [0, 1, 2, 3, 4],
            varIndexByCol: [0, 1, 2, 3, 4, 5],
            rowByVarIndex: [-1, 1, 2, 3, 4, -1, -1, -1, -1, -1],
            colByVarIndex: [0, -1, -1, -1, -1, 5, 6, 7, 8, 9],
            optionalObjectives: [],
        };
        // Ensure matrix is large enough
        tableau.matrix = new Float64Array(30);

        restore.call(tableau as never);

        expect(tableau.nVars).toBe(10);
        expect(tableau.model).toEqual({ name: "saved-model" });
        expect(tableau.variables).toEqual([{ id: "a" }]);
        expect(tableau.lastElementIndex).toBe(20);
        expect(tableau.width).toBe(6);
        expect(tableau.height).toBe(5);
    });

    it("restores matrix using set()", () => {
        const tableau = createMockTableau();
        tableau.matrix = new Float64Array(12);
        tableau.savedState = {
            width: 4,
            height: 3,
            nVars: 5,
            model: null,
            variables: [],
            variablesPerIndex: [],
            unrestrictedVars: {},
            lastElementIndex: 0,
            matrix: new Float64Array([9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 11, 10]),
            varIndexByRow: [0, 1, 2],
            varIndexByCol: [0, 1, 2, 3],
            rowByVarIndex: [-1, 1, 2, -1, -1],
            colByVarIndex: [0, -1, -1, 3, 4],
            optionalObjectives: [],
        };

        restore.call(tableau as never);

        expect(tableau.matrix[0]).toBe(9);
        expect(tableau.matrix[5]).toBe(4);
    });

    it("restores varIndexByRow with correct length", () => {
        const tableau = createMockTableau();
        tableau.varIndexByRow = [0, 1, 2, 3, 4, 5]; // longer than saved
        tableau.savedState = {
            width: 4,
            height: 3,
            nVars: 5,
            model: null,
            variables: [],
            variablesPerIndex: [],
            unrestrictedVars: {},
            lastElementIndex: 0,
            matrix: new Float64Array(12),
            varIndexByRow: [0, 10, 20], // height = 3
            varIndexByCol: [0, 1, 2, 3],
            rowByVarIndex: [-1, 1, 2, -1, -1],
            colByVarIndex: [0, -1, -1, 3, 4],
            optionalObjectives: [],
        };

        restore.call(tableau as never);

        expect(tableau.varIndexByRow).toEqual([0, 10, 20]);
        expect(tableau.varIndexByRow.length).toBe(3);
    });

    it("restores varIndexByCol with correct length", () => {
        const tableau = createMockTableau();
        tableau.varIndexByCol = [0, 1, 2, 3, 4, 5, 6]; // longer than saved
        tableau.savedState = {
            width: 4,
            height: 3,
            nVars: 5,
            model: null,
            variables: [],
            variablesPerIndex: [],
            unrestrictedVars: {},
            lastElementIndex: 0,
            matrix: new Float64Array(12),
            varIndexByRow: [0, 1, 2],
            varIndexByCol: [0, 10, 20, 30], // width = 4
            rowByVarIndex: [-1, 1, 2, -1, -1],
            colByVarIndex: [0, -1, -1, 3, 4],
            optionalObjectives: [],
        };

        restore.call(tableau as never);

        expect(tableau.varIndexByCol).toEqual([0, 10, 20, 30]);
        expect(tableau.varIndexByCol.length).toBe(4);
    });

    it("restores row and column mappings", () => {
        const tableau = createMockTableau({ nVars: 3 });
        tableau.rowByVarIndex = [0, 0, 0];
        tableau.colByVarIndex = [0, 0, 0];
        tableau.savedState = {
            width: 4,
            height: 3,
            nVars: 3,
            model: null,
            variables: [],
            variablesPerIndex: [],
            unrestrictedVars: {},
            lastElementIndex: 0,
            matrix: new Float64Array(12),
            varIndexByRow: [0, 1, 2],
            varIndexByCol: [0, 1, 2, 3],
            rowByVarIndex: [1, 2, 3],
            colByVarIndex: [4, 5, 6],
            optionalObjectives: [],
        };

        restore.call(tableau as never);

        expect(tableau.rowByVarIndex).toEqual([1, 2, 3]);
        expect(tableau.colByVarIndex).toEqual([4, 5, 6]);
    });

    it("restores optional objectives when both have entries", () => {
        const copiedOptObj = { reducedCosts: [1, 2], priority: 1, copy: vi.fn() };
        copiedOptObj.copy.mockReturnValue({ reducedCosts: [1, 2], priority: 1 });

        const tableau = createMockTableau();
        tableau.optionalObjectives = [{ reducedCosts: [0, 0], priority: 0 }] as never;
        tableau.optionalObjectivePerPriority = { 0: tableau.optionalObjectives[0] };
        tableau.objectivesByPriority = { 0: tableau.optionalObjectives[0] };

        tableau.savedState = {
            width: 4,
            height: 3,
            nVars: 5,
            model: null,
            variables: [],
            variablesPerIndex: [],
            unrestrictedVars: {},
            lastElementIndex: 0,
            matrix: new Float64Array(12),
            varIndexByRow: [0, 1, 2],
            varIndexByCol: [0, 1, 2, 3],
            rowByVarIndex: [-1, 1, 2, -1, -1],
            colByVarIndex: [0, -1, -1, 3, 4],
            optionalObjectives: [copiedOptObj],
        };

        restore.call(tableau as never);

        expect(copiedOptObj.copy).toHaveBeenCalled();
        expect(tableau.optionalObjectives).toHaveLength(1);
    });

    it("does not restore optional objectives when savedState has none", () => {
        const tableau = createMockTableau();
        tableau.optionalObjectives = [{ reducedCosts: [1], priority: 1 }] as never;

        tableau.savedState = {
            width: 4,
            height: 3,
            nVars: 5,
            model: null,
            variables: [],
            variablesPerIndex: [],
            unrestrictedVars: {},
            lastElementIndex: 0,
            matrix: new Float64Array(12),
            varIndexByRow: [0, 1, 2],
            varIndexByCol: [0, 1, 2, 3],
            rowByVarIndex: [-1, 1, 2, -1, -1],
            colByVarIndex: [0, -1, -1, 3, 4],
            optionalObjectives: [], // empty
        };

        restore.call(tableau as never);

        // Original optionalObjectives should remain unchanged
        expect(tableau.optionalObjectives).toHaveLength(1);
    });

    it("does not restore optional objectives when current tableau has none", () => {
        const tableau = createMockTableau();
        tableau.optionalObjectives = []; // empty

        const copiedOptObj = { reducedCosts: [1], priority: 1, copy: vi.fn() };

        tableau.savedState = {
            width: 4,
            height: 3,
            nVars: 5,
            model: null,
            variables: [],
            variablesPerIndex: [],
            unrestrictedVars: {},
            lastElementIndex: 0,
            matrix: new Float64Array(12),
            varIndexByRow: [0, 1, 2],
            varIndexByCol: [0, 1, 2, 3],
            rowByVarIndex: [-1, 1, 2, -1, -1],
            colByVarIndex: [0, -1, -1, 3, 4],
            optionalObjectives: [copiedOptObj],
        };

        restore.call(tableau as never);

        // copy should not have been called since current has no optional objectives
        expect(copiedOptObj.copy).not.toHaveBeenCalled();
    });
});
