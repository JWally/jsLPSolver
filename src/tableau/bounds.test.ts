/**
 * Column bounds (upper-bounding technique): imposing a bound on a solved
 * tableau and re-solving must give the same optimum as solving the model with
 * the bound written as an explicit constraint row.
 */
import { describe, it, expect } from "vitest";
import solver from "../solver";
import type Tableau from "./tableau";
import { setVariableBounds, actualValue } from "./bounds";
import {
    generateResourceAllocation,
    generateTransportation,
} from "../test-utils/problem-generator";

type JsonModel = {
    optimize: string;
    opType: "max" | "min";
    constraints: Record<string, { min?: number; max?: number; equal?: number }>;
    variables: Record<string, Record<string, number>>;
    options?: Record<string, unknown>;
};

function solveWithRow(model: JsonModel, name: string, bound: { min?: number; max?: number }) {
    const copy: JsonModel = JSON.parse(JSON.stringify(model));
    copy.constraints.__bound = bound;
    copy.variables[name].__bound = 1;
    return solver.Solve(copy as never) as { feasible: boolean; result: number };
}

function solvedTableau(model: JsonModel): Tableau {
    const copy = JSON.parse(JSON.stringify(model));
    copy.options = { ...(copy.options ?? {}), presolve: false };
    solver.Solve(copy as never);
    return solver.lastSolvedModel!.tableau;
}

function variableIndex(tableau: Tableau, name: string): number {
    return tableau.model!.variables.find((v) => v.id === name)!.index;
}

/** Signed objective as reported by Solve (min: as is; max: negated evaluation). */
function reported(tableau: Tableau): number {
    return tableau.model!.isMinimization ? tableau.evaluation : -tableau.evaluation;
}

const MODELS: Array<[string, JsonModel]> = [
    [
        "resource allocation",
        generateResourceAllocation({ seed: 3, numVariables: 12, numConstraints: 8 }) as never,
    ],
    [
        "transportation",
        generateTransportation({ seed: 5, numVariables: 16, numConstraints: 10 }) as never,
    ],
];

describe("column bounds", () => {
    for (const [label, model] of MODELS) {
        const names = Object.keys(model.variables);

        it(`${label}: upper bounds match explicit rows`, () => {
            const base = solvedTableau(model);
            for (const name of names) {
                const value = actualValue(base, variableIndex(base, name));
                if (value < 1e-6) continue;
                const ub = Math.floor(value / 2);

                const tableau = solvedTableau(model);
                expect(setVariableBounds(tableau, variableIndex(tableau, name), 0, ub)).toBe(true);
                tableau.simplex();
                const reference = solveWithRow(model, name, { max: ub });

                expect(tableau.feasible, `${name} feasible`).toBe(reference.feasible);
                if (reference.feasible) {
                    expect(reported(tableau)).toBeCloseTo(reference.result, 6);
                    expect(actualValue(tableau, variableIndex(tableau, name))).toBeLessThanOrEqual(
                        ub + 1e-7
                    );
                }
            }
        });

        it(`${label}: lower bounds match explicit rows`, () => {
            const base = solvedTableau(model);
            for (const name of names) {
                const lb = Math.floor(actualValue(base, variableIndex(base, name))) + 1;

                const tableau = solvedTableau(model);
                expect(setVariableBounds(tableau, variableIndex(tableau, name), lb, Infinity)).toBe(
                    true
                );
                tableau.simplex();
                const reference = solveWithRow(model, name, { min: lb });

                expect(tableau.feasible, `${name} feasible`).toBe(reference.feasible);
                if (reference.feasible) {
                    expect(reported(tableau)).toBeCloseTo(reference.result, 6);
                    expect(
                        actualValue(tableau, variableIndex(tableau, name))
                    ).toBeGreaterThanOrEqual(lb - 1e-7);
                }
            }
        });

        it(`${label}: boxed bounds on several variables match explicit rows`, () => {
            const base = solvedTableau(model);
            const tableau = solvedTableau(model);
            const copy: JsonModel = JSON.parse(JSON.stringify(model));
            names.slice(0, 4).forEach((name, i) => {
                const value = actualValue(base, variableIndex(base, name));
                // Box strictly below the current value so it binds.
                const ub = Math.max(0, Math.ceil(value) - 1 - (i % 2));
                const lb = Math.max(0, ub - 1);
                setVariableBounds(tableau, variableIndex(tableau, name), lb, ub);
                copy.constraints[`__box${i}`] = { min: lb, max: ub };
                copy.variables[name][`__box${i}`] = 1;
            });
            tableau.simplex();
            const reference = solver.Solve(copy as never) as { feasible: boolean; result: number };
            expect(tableau.feasible).toBe(reference.feasible);
            if (reference.feasible) {
                expect(reported(tableau)).toBeCloseTo(reference.result, 6);
            }
        });
    }
});
