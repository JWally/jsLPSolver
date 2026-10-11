/**
 * Root presolve (bound propagation + coefficient tightening) must never
 * change a MIP's optimum, and must shrink big-M coefficients.
 */
import { describe, it, expect } from "vitest";
import solver from "../solver";
import Model from "../model";
import { presolveRootTableau } from "./root-presolve";
import { upperBoundOf } from "./bounds";

let seed = 777;
const random = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;

/**
 * Fixed-charge supply: integer flows x_j from 3 sites with capacities cap_j,
 * opened by binaries y_j through big-M rows x_j - 100 y_j <= 0, meeting an
 * integer demand. min sum c_j x_j + f_j y_j.
 */
function fixedCharge() {
    const n = 3;
    const cap = Array.from({ length: n }, () => 2 + Math.floor(random() * 5));
    const c = Array.from({ length: n }, () => 1 + Math.floor(random() * 5));
    const f = Array.from({ length: n }, () => 5 + Math.floor(random() * 20));
    const demand = 2 + Math.floor(random() * (cap.reduce((s, x) => s + x, 0) - 2));
    const constraints: Record<string, { min?: number; max?: number }> = {
        demand: { min: demand },
    };
    const variables: Record<string, Record<string, number>> = {};
    const ints: Record<string, 1> = {};
    for (let j = 0; j < n; j++) {
        constraints[`cap${j}`] = { max: cap[j] };
        constraints[`link${j}`] = { max: 0 };
        variables[`x${j}`] = { cost: c[j], demand: 1, [`cap${j}`]: 1, [`link${j}`]: 1 };
        variables[`y${j}`] = { cost: f[j], [`link${j}`]: -100 };
        ints[`x${j}`] = 1;
        ints[`y${j}`] = 1;
        constraints[`ybin${j}`] = { max: 1 };
        variables[`y${j}`][`ybin${j}`] = 1;
    }
    let optimum = Infinity;
    const x = [0, 0, 0];
    const visit = (j: number): void => {
        if (j === n) {
            if (x.reduce((s, v) => s + v, 0) < demand) return;
            let total = 0;
            for (let k = 0; k < n; k++) total += c[k] * x[k] + (x[k] > 0 ? f[k] : 0);
            optimum = Math.min(optimum, total);
            return;
        }
        for (let v = 0; v <= cap[j]; v++) {
            x[j] = v;
            visit(j + 1);
        }
    };
    visit(0);
    return {
        model: { optimize: "cost", opType: "min", constraints, variables, ints },
        optimum,
        cap,
    };
}

describe("presolveRootTableau", () => {
    it("never changes the optimum of random fixed-charge MIPs", () => {
        for (let k = 0; k < 40; k++) {
            const { model, optimum } = fixedCharge();
            const result = solver.Solve(model as never) as { feasible: boolean; result: number };
            expect(result.feasible, `instance ${k}`).toBe(true);
            expect(result.result, `instance ${k}`).toBeCloseTo(optimum, 6);
        }
    });

    it("shrinks big-M coefficients to the implied bound", () => {
        const { model, cap } = fixedCharge();
        const m = new Model().loadJson(model as never);
        const tableau = m.tableau;
        tableau.setModel(m);
        const outcome = presolveRootTableau(tableau);
        expect(outcome.feasible).toBe(true);
        expect(outcome.tightenedCoefficients).toBeGreaterThan(0);
        for (let j = 0; j < 3; j++) {
            const y = m.variables.find((v) => v.id === `y${j}`)!;
            const x = m.variables.find((v) => v.id === `x${j}`)!;
            expect(upperBoundOf(tableau, x.index)).toBe(cap[j]);
            // The link row's y coefficient is now -cap_j (scaled with the row).
            const linkRow = m.constraints.find(
                (c) => c.terms.some((t) => t.variable === y) && c.terms.length === 2
            )!;
            const row = tableau.rowByVarIndex[linkRow.index];
            const yEntry = tableau.matrix[row * tableau.width + tableau.colByVarIndex[y.index]];
            const xEntry = tableau.matrix[row * tableau.width + tableau.colByVarIndex[x.index]];
            expect(yEntry / xEntry).toBeCloseTo(-cap[j], 9);
        }
    });
});
