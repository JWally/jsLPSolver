/**
 * c-MIR cuts must be valid (never cut off a mixed-integer feasible point) and
 * must tighten the bound on mixed rows. Ground truth enumerates the integer
 * part and solves the continuous LP for each assignment.
 */
import { describe, it, expect } from "vitest";
import Model from "../model";
import solver from "../solver";
import { addMirCuts, captureOriginalRows } from "./mir";

let seed = 4242;
const random = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
const randInt = (lo: number, hi: number): number => lo + Math.floor(random() * (hi - lo + 1));

type Json = Record<string, any>;

/** max c.x + d.z, A x + B z <= b, x in {0..3}^3 integer, z in [0, 5]^2. */
function randomMixed(): { model: Json; optimum: number } {
    const c = [randInt(1, 9), randInt(1, 9), randInt(1, 9)];
    const d = [randInt(1, 6), randInt(1, 6)];
    const A = Array.from({ length: 3 }, () => [randInt(1, 9), randInt(1, 9), randInt(1, 9)]);
    const B = Array.from({ length: 3 }, () => [randInt(-4, 6), randInt(-4, 6)]);
    const b = A.map((row) => randInt(8, 20) + row.reduce((s, a) => s + a, 0) * 0.3);

    const build = (fixedX: number[] | null): Json => {
        const constraints: Json = {};
        const variables: Json = {};
        for (let i = 0; i < 3; i++) {
            const shift = fixedX ? A[i].reduce((s, a, j) => s + a * fixedX[j], 0) : 0;
            constraints[`r${i}`] = { max: b[i] - shift };
        }
        for (let k = 0; k < 2; k++) {
            constraints[`zub${k}`] = { max: 5 };
            const coefficients: Json = { obj: d[k], [`zub${k}`]: 1 };
            for (let i = 0; i < 3; i++) coefficients[`r${i}`] = B[i][k];
            variables[`z${k}`] = coefficients;
        }
        if (!fixedX) {
            for (let j = 0; j < 3; j++) {
                constraints[`xub${j}`] = { max: 3 };
                const coefficients: Json = { obj: c[j], [`xub${j}`]: 1 };
                for (let i = 0; i < 3; i++) coefficients[`r${i}`] = A[i][j];
                variables[`x${j}`] = coefficients;
            }
        }
        return {
            optimize: "obj",
            opType: "max",
            constraints,
            variables,
            ...(fixedX ? {} : { ints: { x0: 1, x1: 1, x2: 1 } }),
        };
    };

    let optimum = -Infinity;
    for (let x0 = 0; x0 <= 3; x0++) {
        for (let x1 = 0; x1 <= 3; x1++) {
            for (let x2 = 0; x2 <= 3; x2++) {
                const x = [x0, x1, x2];
                const lp = solver.Solve(build(x) as never) as { feasible: boolean; result: number };
                if (!lp.feasible) continue;
                optimum = Math.max(optimum, lp.result + c.reduce((s, cj, j) => s + cj * x[j], 0));
            }
        }
    }
    return { model: build(null), optimum };
}

function boundsWithMir(model: Json, rounds: number) {
    const m = new Model().loadJson(model as never);
    const tableau = m.tableau;
    tableau.setModel(m);
    const original = captureOriginalRows(tableau)!;
    tableau.simplex();
    const before = -tableau.evaluation;
    let cuts = 0;
    for (let r = 0; r < rounds && tableau.feasible; r++) {
        const added = addMirCuts(tableau, original, 10);
        if (added === 0) break;
        cuts += added;
        tableau.simplex();
    }
    return { before, after: -tableau.evaluation, feasible: tableau.feasible, cuts };
}

describe("c-MIR cuts", () => {
    it("never cut off the mixed-integer optimum and tighten the bound", () => {
        let tightened = 0;
        let tested = 0;
        for (let k = 0; k < 40; k++) {
            const { model, optimum } = randomMixed();
            if (optimum === -Infinity) continue;
            tested++;
            const result = boundsWithMir(model, 5);
            expect(result.feasible, `problem ${k}`).toBe(true);
            expect(result.after, `problem ${k}`).toBeGreaterThanOrEqual(optimum - 1e-6);
            expect(result.after, `problem ${k}`).toBeLessThanOrEqual(result.before + 1e-6);
            if (result.after < result.before - 1e-6) tightened++;
        }
        expect(tested).toBeGreaterThan(30);
        expect(tightened).toBeGreaterThan(5);
    });
});
