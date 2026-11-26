/**
 * Gomory mixed-integer cuts must be valid (never cut off an integer-feasible
 * point) and must tighten the LP bound. Small random bounded integer programs
 * are solved by enumeration for ground truth.
 */
import { describe, it, expect } from "vitest";
import Model from "../model";
import { addGomoryCuts } from "./gomory";

let seed = 12345;
const random = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;

type Problem = {
    model: Record<string, unknown>;
    optimum: number;
};

/** max c.x s.t. A x <= b, 0 <= x <= ub, x integer (3 variables, 3 rows). */
function randomProblem(): Problem {
    const n = 3;
    const m = 3;
    const c = Array.from({ length: n }, () => 1 + Math.floor(random() * 9));
    const ub = Array.from({ length: n }, () => 2 + Math.floor(random() * 4));
    const A = Array.from({ length: m }, () =>
        Array.from({ length: n }, () => 1 + Math.floor(random() * 9))
    );
    const b = A.map((row) => Math.floor(row.reduce((s, a, j) => s + a * ub[j], 0) * 0.45) + 0.5);

    const variables: Record<string, Record<string, number>> = {};
    const constraints: Record<string, { max: number }> = {};
    for (let i = 0; i < m; i++) constraints[`r${i}`] = { max: b[i] };
    for (let j = 0; j < n; j++) {
        constraints[`ub${j}`] = { max: ub[j] };
        const coefficients: Record<string, number> = { obj: c[j], [`ub${j}`]: 1 };
        for (let i = 0; i < m; i++) coefficients[`r${i}`] = A[i][j];
        variables[`x${j}`] = coefficients;
    }
    const ints = { x0: 1, x1: 1, x2: 1 };

    let optimum = -Infinity;
    for (let x0 = 0; x0 <= ub[0]; x0++) {
        for (let x1 = 0; x1 <= ub[1]; x1++) {
            for (let x2 = 0; x2 <= ub[2]; x2++) {
                const x = [x0, x1, x2];
                if (A.every((row, i) => row.reduce((s, a, j) => s + a * x[j], 0) <= b[i])) {
                    optimum = Math.max(
                        optimum,
                        c.reduce((s, cj, j) => s + cj * x[j], 0)
                    );
                }
            }
        }
    }
    return { model: { optimize: "obj", opType: "max", constraints, variables, ints }, optimum };
}

/** Like randomProblem with 6 variables in 0..3 and 4 rows (4096 points to enumerate). */
function widerProblem(): Problem {
    const n = 6;
    const m = 4;
    const ub = 3;
    const c = Array.from({ length: n }, () => 1 + Math.floor(random() * 9));
    const A = Array.from({ length: m }, () =>
        Array.from({ length: n }, () => 1 + Math.floor(random() * 9))
    );
    const b = A.map((row) => Math.floor(row.reduce((s, a) => s + a * ub, 0) * 0.4) + 0.5);
    const variables: Record<string, Record<string, number>> = {};
    const constraints: Record<string, { max: number }> = {};
    const ints: Record<string, 1> = {};
    for (let i = 0; i < m; i++) constraints[`r${i}`] = { max: b[i] };
    for (let j = 0; j < n; j++) {
        constraints[`ub${j}`] = { max: ub };
        const coefficients: Record<string, number> = { obj: c[j], [`ub${j}`]: 1 };
        for (let i = 0; i < m; i++) coefficients[`r${i}`] = A[i][j];
        variables[`x${j}`] = coefficients;
        ints[`x${j}`] = 1;
    }
    let optimum = -Infinity;
    const x = new Array<number>(n).fill(0);
    const visit = (j: number): void => {
        if (j === n) {
            if (A.every((row, i) => row.reduce((s, a, k) => s + a * x[k], 0) <= b[i])) {
                optimum = Math.max(
                    optimum,
                    c.reduce((s, cj, k) => s + cj * x[k], 0)
                );
            }
            return;
        }
        for (let v = 0; v <= ub; v++) {
            x[j] = v;
            visit(j + 1);
        }
    };
    visit(0);
    return { model: { optimize: "obj", opType: "max", constraints, variables, ints }, optimum };
}

/** Root LP bound (as a maximum) before and after `rounds` rounds of GMI cuts. */
function boundsWithCuts(model: Record<string, unknown>, rounds: number, relaxNoise = false) {
    const m = new Model().loadJson(model as never);
    const tableau = m.tableau;
    tableau.setModel(m);
    tableau.simplex();
    const before = -tableau.evaluation;
    let cuts = 0;
    for (let r = 0; r < rounds && tableau.feasible; r++) {
        const added = addGomoryCuts(tableau, 10, relaxNoise);
        if (added === 0) break;
        cuts += added;
        tableau.simplex();
    }
    return { before, after: -tableau.evaluation, feasible: tableau.feasible, cuts };
}

describe("addGomoryCuts", () => {
    it("never cuts off the integer optimum and tightens the bound", () => {
        let tightened = 0;
        for (let k = 0; k < 40; k++) {
            const { model, optimum } = randomProblem();
            const result = boundsWithCuts(model, 5);
            expect(result.feasible, `problem ${k}`).toBe(true);
            // A valid relaxation bound can never drop below the integer optimum.
            expect(result.after, `problem ${k}`).toBeGreaterThanOrEqual(optimum - 1e-6);
            expect(result.after, `problem ${k}`).toBeLessThanOrEqual(result.before + 1e-6);
            if (result.after < result.before - 1e-6) tightened++;
        }
        expect(tightened).toBeGreaterThan(10);
    });

    it("stays valid when noise-sized coefficients are relaxed away", () => {
        // Larger models and more rounds, so repeated pivots leave entries
        // that are integral up to rounding in the rows being cut.
        for (let k = 0; k < 25; k++) {
            const { model, optimum } = widerProblem();
            const result = boundsWithCuts(model, 8, true);
            expect(result.feasible, `problem ${k}`).toBe(true);
            expect(result.after, `problem ${k}`).toBeGreaterThanOrEqual(optimum - 1e-6);
            expect(result.after, `problem ${k}`).toBeLessThanOrEqual(result.before + 1e-6);
        }
        for (let k = 0; k < 40; k++) {
            const { model, optimum } = randomProblem();
            const result = boundsWithCuts(model, 5, true);
            expect(result.after, `problem ${k}`).toBeGreaterThanOrEqual(optimum - 1e-6);
        }
    });

    it("adds nothing when the LP optimum is already integral", () => {
        const model = {
            optimize: "obj",
            opType: "max",
            constraints: { r: { max: 4 } },
            variables: { x: { obj: 1, r: 1 }, y: { obj: 1, r: 1 } },
            ints: { x: 1, y: 1 },
        };
        expect(boundsWithCuts(model, 3).cuts).toBe(0);
    });
});
