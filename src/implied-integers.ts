/**
 * @file src/implied-integers.ts
 * @description Detect continuous variables that can be treated as integer
 *
 * A continuous variable x is implied integer when every constraint it
 * appears in, divided by x's coefficient, has integer coefficients on
 * integer variables only and integer bounds. Fix the integer variables at
 * any feasible value: each such row then bounds x by an integer, so x's
 * feasible set is an interval with integer endpoints, and a linear objective
 * attains its optimum at an integral point of it. Some optimal solution
 * therefore has x integral, so branching and cuts may treat it as integer.
 *
 * Typical case: a "max-min" or makespan variable, e.g. maximize floor with
 * sum_i skill_i x_iq - floor >= 0 for each period q. Treating floor as
 * integer lets the LP bound round down to the best integral floor.
 */
import type { Model as JsonModel } from "./types/solver";

const EPS = 1e-9;
const isIntegral = (value: number): boolean => Math.abs(value - Math.round(value)) < EPS;

/** Ids of continuous variables that can be treated as integer. */
export function findImpliedIntegers(model: JsonModel): Set<string> {
    const implied = new Set<string>();
    const variables = model.variables as Record<string, Record<string, number>>;
    const constraints = (model.constraints ?? {}) as Record<
        string,
        { min?: number; max?: number; equal?: number }
    >;
    const integers = new Set([
        ...Object.keys(model.ints ?? {}),
        ...Object.keys(model.binaries ?? {}),
    ]);
    const unrestricted = model.unrestricted ?? {};
    const objective = model.optimize as string;

    // Terms of each constraint.
    const rows = new Map<string, Array<[string, number]>>();
    for (const [variableId, coefficients] of Object.entries(variables)) {
        for (const [key, coefficient] of Object.entries(coefficients)) {
            if (key === objective || !(key in constraints) || coefficient === 0) continue;
            let row = rows.get(key);
            if (row === undefined) rows.set(key, (row = []));
            row.push([variableId, coefficient]);
        }
    }

    for (const [variableId, coefficients] of Object.entries(variables)) {
        if (integers.has(variableId) || unrestricted[variableId]) continue;
        let appears = false;
        let ok = true;
        for (const [key, own] of Object.entries(coefficients)) {
            if (key === objective || !(key in constraints) || own === 0) continue;
            appears = true;
            const bound = constraints[key];
            for (const value of [bound.min, bound.max, bound.equal]) {
                if (value !== undefined && !isIntegral(value / own)) ok = false;
            }
            for (const [other, coefficient] of rows.get(key) ?? []) {
                if (other === variableId) continue;
                if (!integers.has(other) || !isIntegral(coefficient / own)) {
                    ok = false;
                    break;
                }
            }
            if (!ok) break;
        }
        if (appears && ok) implied.add(variableId);
    }
    return implied;
}
