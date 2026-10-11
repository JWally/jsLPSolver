import { describe, it, expect } from "vitest";
import { findImpliedIntegers, findIntegralContinuous } from "./implied-integers";
import solver from "./solver";

const balance = (skillA: number, skillB: number) => ({
    optimize: "floor",
    opType: "max" as const,
    constraints: {
        q1: { min: 0 }, // a1*skillA + b1*skillB - floor >= 0
        q2: { min: 0 },
        a: { equal: 1 }, // player a plays exactly one quarter
        b: { equal: 1 },
    },
    variables: {
        a1: { q1: skillA, a: 1 },
        a2: { q2: skillA, a: 1 },
        b1: { q1: skillB, b: 1 },
        b2: { q2: skillB, b: 1 },
        floor: { floor: 1, q1: -1, q2: -1 },
    },
    binaries: { a1: 1, a2: 1, b1: 1, b2: 1 },
});

describe("findImpliedIntegers", () => {
    it("detects a continuous variable bounded only by integer rows", () => {
        expect([...findImpliedIntegers(balance(3, 5) as never)]).toEqual(["floor"]);
    });

    it("rejects a coefficient that does not divide the row", () => {
        const model = balance(3, 5);
        model.variables.floor = { floor: 1, q1: -2, q2: -1 };
        expect(findImpliedIntegers(model as never).size).toBe(0);
    });

    it("rejects a fractional right-hand side", () => {
        const model = balance(3, 5);
        model.constraints.q1 = { min: 0.5 };
        expect(findImpliedIntegers(model as never).size).toBe(0);
    });

    it("rejects rows that also hold another continuous variable", () => {
        const model = balance(3, 5) as Record<string, any>;
        model.variables.extra = { q1: 1 };
        expect(findImpliedIntegers(model as never).size).toBe(0);
    });

    it("rejects non-integer coefficients on the integer variables", () => {
        expect(findImpliedIntegers(balance(3, 5.5) as never).size).toBe(0);
    });

    it("keeps the optimum (the weaker quarter is as strong as possible)", () => {
        const result = solver.Solve(balance(3, 5) as never) as { result: number };
        expect(result.result).toBe(3);
    });
});

describe("findIntegralContinuous", () => {
    // Facility location: open vendors z (integer), assign customers y_ij
    // (continuous) with sum_j y_ij = 1 and y_ij <= z_j.
    const facility = () => ({
        optimize: "cost",
        opType: "min" as const,
        constraints: {
            one0: { equal: 1 },
            one1: { equal: 1 },
            link00: { max: 0 },
            link01: { max: 0 },
            link10: { max: 0 },
            link11: { max: 0 },
            count: { max: 1 },
        },
        variables: {
            z0: { cost: 3, link00: -1, link10: -1, count: 1 },
            z1: { cost: 4, link01: -1, link11: -1, count: 1 },
            y00: { cost: 1, one0: 1, link00: 1 },
            y01: { cost: 2, one0: 1, link01: 1 },
            y10: { cost: 2, one1: 1, link10: 1 },
            y11: { cost: 1, one1: 1, link11: 1 },
        },
        ints: { z0: 1, z1: 1 },
    });

    it("finds continuous variables whose coupling rows are totally unimodular", () => {
        expect([...findIntegralContinuous(facility() as never)].sort()).toEqual([
            "y00",
            "y01",
            "y10",
            "y11",
        ]);
    });

    it("rejects a variable in two rows shared with other continuous variables", () => {
        const model = facility() as Record<string, any>;
        model.constraints.extra = { max: 1 };
        model.variables.y00.extra = 1;
        model.variables.y11.extra = 1;
        const found = findIntegralContinuous(model as never);
        expect(found.has("y00")).toBe(false);
        expect(found.has("y11")).toBe(false);
    });

    it("rejects mixed continuous coefficients in a shared row", () => {
        const model = facility() as Record<string, any>;
        model.variables.y01.one0 = 2;
        const found = findIntegralContinuous(model as never);
        expect(found.has("y00")).toBe(false);
        expect(found.has("y01")).toBe(false);
    });

    it("rejects a fractional right-hand side", () => {
        const model = facility() as Record<string, any>;
        model.constraints.one0 = { equal: 1.5 };
        expect(findIntegralContinuous(model as never).has("y00")).toBe(false);
    });
});
