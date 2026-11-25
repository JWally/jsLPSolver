/**
 * Property tests on small random models, checked against oracles that do not
 * depend on the solver:
 * - the returned point satisfies every constraint, integrality and binary
 *   bound, and reproduces the reported objective;
 * - pure-integer models (every variable capped) are brute-forced;
 * - presolve on and off agree.
 *
 * Models are tiny but are built to hit the column-bounds path (single-variable
 * rows with coefficients 2-3 give fractional bounds) and presolve fixings.
 */
import { describe, it, expect } from "vitest";
import solver from "./solver";
import type { Model, SolveResult } from "./types/solver";

type Bound = { min?: number; max?: number; equal?: number };
interface SmallModel {
    optimize: "obj";
    opType: "max" | "min";
    constraints: Record<string, Bound>;
    variables: Record<string, Record<string, number>>;
    ints?: Record<string, 1>;
    binaries?: Record<string, 1>;
    options?: { presolve: boolean };
}

const TOL = 1e-5;

function solve(model: SmallModel, presolve?: boolean): SolveResult {
    const copy = JSON.parse(JSON.stringify(model)) as SmallModel;
    if (presolve !== undefined) copy.options = { presolve };
    return solver.Solve(copy as unknown as Model) as SolveResult;
}

/** Mulberry32 */
function createRng(seed: number): () => number {
    return () => {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function generate(rand: () => number): SmallModel {
    const int = (lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1));
    const nVariables = int(1, 4);
    const nConstraints = int(1, 4);
    const constraints: Record<string, Bound> = {};
    const variables: Record<string, Record<string, number>> = {};
    for (let c = 0; c < nConstraints; c++) {
        const kind = int(0, 4);
        const rhs = int(-4, 12);
        constraints[`c${c}`] =
            kind === 0 ? { equal: rhs } : kind <= 2 ? { max: rhs } : { min: rhs };
    }
    for (let v = 0; v < nVariables; v++) {
        // A cap row per variable keeps the model bounded and enumerable.
        const capCoefficient = rand() < 0.3 ? int(2, 3) : 1;
        constraints[`u${v}`] = { max: int(1, 6) * (rand() < 0.3 ? int(2, 3) : 1) };
        const row: Record<string, number> = { obj: int(-5, 5), [`u${v}`]: capCoefficient };
        for (let c = 0; c < nConstraints; c++) {
            if (rand() < 0.5) row[`c${c}`] = int(-4, 4) || 1;
        }
        variables[`x${v}`] = row;
    }
    const model: SmallModel = {
        optimize: "obj",
        opType: rand() < 0.5 ? "max" : "min",
        constraints,
        variables,
    };
    const ids = Object.keys(variables);
    const kind = rand();
    if (kind < 0.35) {
        model.ints = Object.fromEntries(ids.map((id) => [id, 1 as const]));
    } else if (kind < 0.7) {
        model.ints = Object.fromEntries(
            ids.filter(() => rand() < 0.5).map((id) => [id, 1 as const])
        );
    }
    if (rand() < 0.15) {
        model.binaries = Object.fromEntries(
            ids.filter(() => rand() < 0.4).map((id) => [id, 1 as const])
        );
    }
    return model;
}

const isIntegerVariable = (model: SmallModel, id: string): boolean =>
    model.ints?.[id] === 1 || model.binaries?.[id] === 1;

/** Why `point` is not a feasible solution with objective `result`, or null. */
function violation(
    model: SmallModel,
    point: Record<string, number>,
    result: number
): string | null {
    const value = (id: string): number => point[id] ?? 0;
    let objective = 0;
    for (const id of Object.keys(model.variables)) {
        const x = value(id);
        if (x < -TOL) return `${id} = ${x} is negative`;
        if (isIntegerVariable(model, id) && Math.abs(x - Math.round(x)) > TOL)
            return `${id} = ${x} is not integral`;
        if (model.binaries?.[id] === 1 && x > 1 + TOL) return `binary ${id} = ${x}`;
        objective += (model.variables[id].obj ?? 0) * x;
    }
    for (const [name, bound] of Object.entries(model.constraints)) {
        let lhs = 0;
        for (const id of Object.keys(model.variables)) {
            lhs += (model.variables[id][name] ?? 0) * value(id);
        }
        const lo = bound.equal ?? bound.min;
        const hi = bound.equal ?? bound.max;
        if (lo !== undefined && lhs < lo - TOL) return `${name}: ${lhs} < ${lo}`;
        if (hi !== undefined && lhs > hi + TOL) return `${name}: ${lhs} > ${hi}`;
    }
    if (Math.abs(objective - result) > TOL * Math.max(1, Math.abs(objective))) {
        return `reported objective ${result}, point gives ${objective}`;
    }
    return null;
}

/** Exact optimum of a pure-integer model by enumeration (null if not pure integer). */
function bruteForce(model: SmallModel): { feasible: boolean; result: number } | null {
    const ids = Object.keys(model.variables);
    if (!ids.every((id) => isIntegerVariable(model, id))) return null;
    const caps = ids.map((id, v) => {
        const cap = Math.floor(model.constraints[`u${v}`].max! / model.variables[id][`u${v}`]);
        return model.binaries?.[id] === 1 ? Math.min(cap, 1) : cap;
    });
    const sense = model.opType === "max" ? 1 : -1;
    let best: number | null = null;
    const point: Record<string, number> = {};
    const visit = (v: number): void => {
        if (v === ids.length) {
            let objective = 0;
            for (const id of ids) objective += (model.variables[id].obj ?? 0) * point[id];
            if (
                violation(model, point, objective) === null &&
                (best === null || sense * objective > sense * best)
            ) {
                best = objective;
            }
            return;
        }
        for (let k = 0; k <= caps[v]; k++) {
            point[ids[v]] = k;
            visit(v + 1);
        }
    };
    visit(0);
    return best === null ? { feasible: false, result: 0 } : { feasible: true, result: best };
}

function pointOf(result: SolveResult, model: SmallModel): Record<string, number> {
    const point: Record<string, number> = {};
    for (const id of Object.keys(model.variables)) {
        const x = (result as unknown as Record<string, unknown>)[id];
        point[id] = typeof x === "number" ? x : 0;
    }
    return point;
}

describe("random small models", () => {
    const N_MODELS = 400;
    const rand = createRng(20261125);
    const models = Array.from({ length: N_MODELS }, () => generate(rand));

    it("return feasible points that reproduce the reported objective", () => {
        for (const model of models) {
            for (const presolve of [undefined, true, false]) {
                const result = solve(model, presolve);
                if (!result.feasible) continue;
                const problem = violation(model, pointOf(result, model), result.result);
                expect(problem, `${JSON.stringify(model)} presolve=${presolve}`).toBeNull();
            }
        }
    });

    it("match brute force on pure-integer models", () => {
        let checked = 0;
        for (const model of models) {
            const truth = bruteForce(model);
            if (truth === null) continue;
            checked++;
            const result = solve(model);
            const context = JSON.stringify(model);
            expect(result.feasible, context).toBe(truth.feasible);
            if (truth.feasible) expect(result.result, context).toBeCloseTo(truth.result, 6);
        }
        expect(checked).toBeGreaterThan(100);
    });

    it("give the same objective with presolve on and off", () => {
        for (const model of models) {
            const on = solve(model, true);
            const off = solve(model, false);
            const context = JSON.stringify(model);
            expect(on.feasible, context).toBe(off.feasible);
            if (on.feasible) expect(on.result, context).toBeCloseTo(off.result, 6);
        }
    });
});

describe("integer column bounds", () => {
    it("rounds a fractional single-variable bound on an integer variable", () => {
        // 3x >= 7 is x >= 3 for integer x; x = 7/3 used to come back as integral
        const min = solve({
            optimize: "obj",
            opType: "min",
            constraints: { a: { min: 7 } },
            variables: { x: { obj: 1, a: 3 } },
            ints: { x: 1 },
        });
        expect(min.feasible).toBe(true);
        expect(min.result).toBeCloseTo(3);

        const max = solve({
            optimize: "obj",
            opType: "max",
            constraints: { a: { max: 7 } },
            variables: { x: { obj: 1, a: 3 } },
            ints: { x: 1 },
        });
        expect(max.feasible).toBe(true);
        expect(max.result).toBeCloseTo(2);
    });

    it("does not crash when a nonbasic integer column rests at a fractional bound", () => {
        // Branch and cut picked a branching variable from an empty candidate list.
        const result = solve({
            optimize: "obj",
            opType: "min",
            constraints: { c0: { min: 8 }, c1: { min: 7 }, cap: { max: 14 } },
            variables: {
                x0: { obj: -3, cap: 1, c0: 1, c1: 3 },
                x1: { obj: 0, cap: 1 },
                x2: { obj: 0, cap: 1, c0: 2 },
            },
            ints: { x0: 1, x1: 1, x2: 1 },
        });
        expect(result.feasible).toBe(true);
        expect(result.result).toBeCloseTo(-42);
    });

    it("reports infeasible when rounding empties an integer variable's range", () => {
        // 7/3 <= x <= 8/3 holds no integer
        const result = solve({
            optimize: "obj",
            opType: "max",
            constraints: { a: { min: 7 }, b: { max: 8 } },
            variables: { x: { obj: 1, a: 3, b: 3 }, y: { obj: 1, c: 1 } },
            ints: { x: 1 },
        });
        expect(result.feasible).toBe(false);
    });

    it("reports infeasible when a single-variable row forces a binary above 1", () => {
        for (const bound of [{ equal: 8 }, { min: 2 }]) {
            const result = solve({
                optimize: "obj",
                opType: "max",
                constraints: { a: bound },
                variables: { x: { obj: 1, a: 1 }, y: { obj: 1, b: 1 } },
                binaries: { x: 1 },
                ints: { y: 1 },
            });
            expect(result.feasible).toBe(false);
        }
    });

    it("rounds a binary's fractional lower bound up to 1", () => {
        const result = solve({
            optimize: "obj",
            opType: "min",
            constraints: { a: { min: 1 } },
            variables: { x: { obj: 1, a: 2 }, y: { obj: 1, b: 1 } },
            binaries: { x: 1 },
            ints: { y: 1 },
        });
        expect(result.feasible).toBe(true);
        expect(result.result).toBeCloseTo(1);
    });
});

describe("presolve fixed variables", () => {
    it("keeps a fixed variable's cost in the objective", () => {
        // x = 1 and -4x <= -4: presolve fixes x = 1, whose cost must still count
        for (const presolve of [true, false]) {
            const result = solve(
                {
                    optimize: "obj",
                    opType: "min",
                    constraints: { a: { equal: 1 }, b: { max: -4 }, cap: { max: 6 } },
                    variables: { x: { obj: -1, cap: 1, a: 1, b: -4 } },
                },
                presolve
            );
            expect(result.feasible).toBe(true);
            expect(result.result).toBeCloseTo(-1);
        }
    });
});
