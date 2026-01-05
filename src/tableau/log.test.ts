import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { log } from "./log";

/**
 * Creates a mock Tableau for testing the log function.
 */
function createMockTableau(options?: {
    width?: number;
    height?: number;
    optionalObjectives?: Array<{ reducedCosts: number[]; priority: number }>;
}) {
    const width = options?.width ?? 4;
    const height = options?.height ?? 3;

    return {
        width,
        height,
        matrix: new Float64Array(width * height),
        varIndexByRow: Array.from({ length: height }, (_, i) => i),
        varIndexByCol: Array.from({ length: width }, (_, i) => i),
        rowByVarIndex: Array.from({ length: width }, (_, i) => (i < height ? i : -1)),
        colByVarIndex: Array.from({ length: width }, (_, i) => i),
        variablesPerIndex: [undefined, { id: "x" }, { id: "y" }, { id: "z" }],
        costRowIndex: 0,
        optionalObjectives: options?.optionalObjectives ?? [],
        feasible: true,
        evaluation: 42,
    };
}

describe("log", () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
        consoleSpy.mockRestore();
    });

    it("returns this without logging when DEBUG_ENABLED is false", () => {
        const tableau = createMockTableau();

        const result = log.call(tableau as never, "test message");

        expect(result).toBe(tableau);
        expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("logs when force is true", () => {
        const tableau = createMockTableau();

        const result = log.call(tableau as never, "test message", true);

        expect(result).toBe(tableau);
        expect(consoleSpy).toHaveBeenCalled();
    });

    it("logs tableau dimensions when force is true", () => {
        const tableau = createMockTableau({ width: 5, height: 4 });

        log.call(tableau as never, "test", true);

        expect(consoleSpy).toHaveBeenCalledWith("Nb Variables", 4); // width - 1
        expect(consoleSpy).toHaveBeenCalledWith("Nb Constraints", 3); // height - 1
    });

    it("logs basic and non-basic indexes", () => {
        const tableau = createMockTableau();

        log.call(tableau as never, "test", true);

        expect(consoleSpy).toHaveBeenCalledWith("Basic Indexes", tableau.varIndexByRow);
        expect(consoleSpy).toHaveBeenCalledWith("Non Basic Indexes", tableau.varIndexByCol);
    });

    it("logs rows and cols mappings", () => {
        const tableau = createMockTableau();

        log.call(tableau as never, "test", true);

        expect(consoleSpy).toHaveBeenCalledWith("Rows", tableau.rowByVarIndex);
        expect(consoleSpy).toHaveBeenCalledWith("Cols", tableau.colByVarIndex);
    });

    it("logs feasibility and evaluation", () => {
        const tableau = createMockTableau();
        tableau.feasible = false;
        tableau.evaluation = 100;

        log.call(tableau as never, "test", true);

        expect(consoleSpy).toHaveBeenCalledWith("Feasible?", false);
        expect(consoleSpy).toHaveBeenCalledWith("evaluation", 100);
    });

    it("uses variable id when available", () => {
        const tableau = createMockTableau();

        log.call(tableau as never, "test", true);

        // Variable names should appear in the logged output
        const allCalls = consoleSpy.mock.calls.flat().join(" ");
        expect(allCalls).toContain("x");
    });

    it("uses fallback name when variable is undefined", () => {
        const tableau = createMockTableau();
        tableau.variablesPerIndex = [undefined, undefined, undefined, undefined];

        log.call(tableau as never, "test", true);

        // Should use "c" + index format for undefined variables
        const allCalls = consoleSpy.mock.calls.flat().join(" ");
        expect(allCalls).toContain("c");
    });

    it("logs optional objectives when present", () => {
        const tableau = createMockTableau({
            width: 4,
            height: 3,
            optionalObjectives: [
                { reducedCosts: [1, 2, 3, 4], priority: 1 },
            ],
        });

        log.call(tableau as never, "test", true);

        expect(consoleSpy).toHaveBeenCalledWith("    Optional objectives:");
    });

    it("handles empty optional objectives array", () => {
        const tableau = createMockTableau({ optionalObjectives: [] });

        log.call(tableau as never, "test", true);

        // Should not log "Optional objectives:" when array is empty
        const allCalls = consoleSpy.mock.calls.flat().join(" ");
        expect(allCalls).not.toContain("Optional objectives:");
    });

    it("handles long variable names", () => {
        const tableau = createMockTableau();
        tableau.variablesPerIndex = [
            undefined,
            { id: "longVariableName" }, // > 5 chars
            { id: "y" },
            { id: "z" },
        ];

        log.call(tableau as never, "test", true);

        const allCalls = consoleSpy.mock.calls.flat().join(" ");
        expect(allCalls).toContain("longVariableName");
    });

    it("formats matrix values with 5 decimal places", () => {
        const tableau = createMockTableau();
        tableau.matrix[1] = 3.14159265359;

        log.call(tableau as never, "test", true);

        const allCalls = consoleSpy.mock.calls.flat().join(" ");
        expect(allCalls).toContain("3.14159");
    });

    it("handles negative values in optional objectives", () => {
        const tableau = createMockTableau({
            width: 3,
            height: 2,
            optionalObjectives: [
                { reducedCosts: [-1, -2, -3], priority: 1 },
            ],
        });

        log.call(tableau as never, "test", true);

        // Should handle negative values without extra space
        expect(consoleSpy).toHaveBeenCalled();
    });
});
