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
    if (!Object.keys(variables).some((id) => !integers.has(id) && !unrestricted[id])) {
        return implied; // no continuous candidates
    }

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

/**
 * Ids of continuous variables that take integral values at some optimal
 * solution once the integer variables are fixed, by total unimodularity.
 *
 * Fixpoint over a candidate set S (continuous, not free): a row holding two
 * or more S variables must give them all the same coefficient magnitude k,
 * with integer variables' coefficients and the bounds integral multiples of
 * k, and each S variable may appear in at most one such row. A row holding
 * exactly one S variable must satisfy the single-variable rule above (it is
 * then an integral bound once the integers are fixed). Any row that also
 * holds a continuous variable outside S disqualifies its S variables.
 *
 * With the integers fixed, the rows shared between S variables form a matrix
 * with at most one +-1 per column (after scaling by k), which is totally
 * unimodular, and every other row is an integral bound, so the polyhedron of
 * S is integral and a linear objective has an integral optimal vertex.
 * Facility location is the typical case: sum_j y_ij = 1 and y_ij <= z_j.
 *
 * Unlike findImpliedIntegers, these are not meant for branching (there can
 * be many, and they follow the integers); they let branch-and-cut round the
 * objective bound when all objective coefficients are integral.
 */
export function findIntegralContinuous(model: JsonModel): Set<string> {
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
    // Only worth computing when it can decide objective integrality: every
    // objective coefficient integral and some continuous variable costed.
    let costedContinuous = false;
    for (const [variableId, coefficients] of Object.entries(variables)) {
        const cost = coefficients[objective] ?? 0;
        if (cost === 0) continue;
        if (!Number.isInteger(cost)) return new Set();
        if (!integers.has(variableId)) costedContinuous = true;
    }
    if (!costedContinuous) return new Set();

    const rows = new Map<string, Array<[string, number]>>();
    for (const [variableId, coefficients] of Object.entries(variables)) {
        for (const [key, coefficient] of Object.entries(coefficients)) {
            if (key === objective || !(key in constraints) || coefficient === 0) continue;
            let row = rows.get(key);
            if (row === undefined) rows.set(key, (row = []));
            row.push([variableId, coefficient]);
        }
    }

    const candidates = new Set<string>();
    for (const variableId of Object.keys(variables)) {
        if (!integers.has(variableId) && !unrestricted[variableId]) candidates.add(variableId);
    }
    const boundsIntegral = (key: string, k: number): boolean => {
        const bound = constraints[key];
        return [bound.min, bound.max, bound.equal].every(
            (value) => value === undefined || isIntegral(value / k)
        );
    };

    let changed = true;
    while (changed) {
        changed = false;
        const sharedRows = new Map<string, number>();
        const drop = (ids: Iterable<string>): void => {
            for (const id of ids) if (candidates.delete(id)) changed = true;
        };
        for (const [key, terms] of rows) {
            const continuous = terms.filter(([id]) => !integers.has(id));
            if (continuous.length === 0) continue;
            if (continuous.some(([id]) => !candidates.has(id))) {
                drop(continuous.map(([id]) => id));
                continue;
            }
            const k = Math.abs(continuous[0][1]);
            const ok =
                continuous.every(([, a]) => Math.abs(a) === k) &&
                boundsIntegral(key, k) &&
                terms.every(([id, a]) => !integers.has(id) || isIntegral(a / k));
            if (!ok) {
                drop(continuous.map(([id]) => id));
                continue;
            }
            if (continuous.length >= 2) {
                for (const [id] of continuous) sharedRows.set(id, (sharedRows.get(id) ?? 0) + 1);
            }
        }
        for (const [id, count] of sharedRows) if (count > 1) drop([id]);
    }
    for (const id of [...candidates]) {
        if (!Object.keys(variables[id]).some((key) => rows.has(key))) candidates.delete(id);
    }
    return candidates;
}
