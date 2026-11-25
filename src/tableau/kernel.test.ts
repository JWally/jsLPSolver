/**
 * The WebAssembly pivot kernel must be a drop-in for the JS row update:
 * same arithmetic, so the same pivots, nodes and answers.
 */
import { describe, it, expect, afterEach } from "vitest";
import solver from "../solver";
import { allocMatrix, kernelOf } from "./kernel";
import {
    generateRandomLP,
    generateRandomMIP,
    generateKnapsack,
} from "../test-utils/problem-generator";
import type { Model } from "../types/solver";

const solveWith = (model: unknown, wasm: boolean): Record<string, unknown> => {
    if (wasm) delete process.env.JSLP_NO_WASM;
    else process.env.JSLP_NO_WASM = "1";
    const result = solver.Solve(JSON.parse(JSON.stringify(model)) as Model);
    return {
        ...(result as unknown as Record<string, unknown>),
        nodes: solver.lastSolvedModel?.tableau.branchAndCutIterations,
        pivots: solver.lastSolvedModel?.tableau.pivotCount,
    };
};

describe("WebAssembly pivot kernel", () => {
    const original = process.env.JSLP_NO_WASM;
    afterEach(() => {
        if (original === undefined) delete process.env.JSLP_NO_WASM;
        else process.env.JSLP_NO_WASM = original;
    });

    it("is used for matrices of 2048 cells or more, and not below", () => {
        delete process.env.JSLP_NO_WASM;
        expect(kernelOf(allocMatrix(4096, 64))).toBeDefined();
        expect(kernelOf(allocMatrix(100, 10))).toBeUndefined();
    });

    it("falls back to a plain array when disabled", () => {
        process.env.JSLP_NO_WASM = "1";
        const matrix = allocMatrix(4096, 64);
        expect(kernelOf(matrix)).toBeUndefined();
        expect(matrix.length).toBe(4096);
    });

    it("gives exactly the JS results, pivot for pivot", () => {
        const models = [
            generateRandomLP({ seed: 1, numVariables: 80, numConstraints: 60 }),
            generateRandomLP({ seed: 2, numVariables: 150, numConstraints: 90, density: 0.3 }),
            generateRandomMIP({ seed: 3, numVariables: 60, numConstraints: 40 }),
            generateRandomMIP({ seed: 4, numVariables: 90, numConstraints: 50, density: 0.2 }),
            generateKnapsack({ seed: 5, numVariables: 120 }),
        ];
        let pivots = 0;
        for (const model of models) {
            const js = solveWith(model, false);
            const wasm = solveWith(model, true);
            expect(wasm).toEqual(js);
            pivots += js.pivots as number;
        }
        expect(pivots).toBeGreaterThan(100);
    });
});
