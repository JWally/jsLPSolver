import { describe, it, expect } from "vitest";
import { findImpliedIntegers } from "./implied-integers";
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
