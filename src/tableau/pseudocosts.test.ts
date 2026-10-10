import { describe, it, expect } from "vitest";
import { Pseudocosts, productScore } from "./pseudocosts";

describe("Pseudocosts", () => {
    it("averages per-unit gains separately for each direction", () => {
        const pc = new Pseudocosts(3);
        pc.record(1, false, 0.25, 1); // 4 per unit
        pc.record(1, false, 0.5, 1); // 2 per unit
        pc.record(1, true, 0.5, 3); // 6 per unit
        expect(pc.down(1)).toBe(3);
        expect(pc.up(1)).toBe(6);
        expect(pc.reliability(1)).toBe(1);
    });

    it("falls back to the average over observed variables", () => {
        const pc = new Pseudocosts(3);
        pc.record(0, true, 1, 2);
        pc.record(2, true, 1, 4);
        expect(pc.up(1)).toBe(3);
        expect(pc.reliability(1)).toBe(0);
    });

    it("ignores infeasible children and zero-distance moves", () => {
        const pc = new Pseudocosts(2);
        pc.record(0, true, 0.5, Infinity);
        pc.record(0, true, 0, 1);
        expect(pc.reliability(0)).toBe(0);
        pc.record(0, true, 0.5, 1);
        pc.record(0, false, 0.5, 1);
        expect(pc.reliability(0)).toBe(1);
    });

    it("scores with the product rule, preferring balanced degradation", () => {
        expect(productScore(2, 2)).toBeGreaterThan(productScore(4, 0));
        const pc = new Pseudocosts(2);
        pc.record(0, false, 0.5, 1); // down 2 per unit
        pc.record(0, true, 0.5, 1); // up 2 per unit
        expect(pc.score(0, 0.5)).toBeCloseTo(1); // (2 * 0.5) * (2 * 0.5)
    });
});
