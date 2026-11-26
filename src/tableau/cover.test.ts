/**
 * Cover cuts are checked directly: every 0/1 point that satisfies the row
 * must satisfy the cut, and the fractional point it was separated at must
 * violate it.
 */
import { describe, it, expect } from "vitest";
import { separateCoverCut, type CoverVariable } from "./cover";

let seed = 20261127;
const random = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;

function randomRow(n: number) {
    const coef = Array.from({ length: n }, () => {
        const magnitude = 1 + Math.floor(random() * 20);
        return random() < 0.3 ? -magnitude : magnitude;
    });
    const positive = coef.filter((a) => a > 0).reduce((s, a) => s + a, 0);
    const negative = coef.filter((a) => a < 0).reduce((s, a) => s + a, 0);
    // A right-hand side strictly between the row's smallest and largest activity.
    const rhs = Math.floor(negative + (0.2 + 0.6 * random()) * (positive - negative));
    return { index: coef.map((_, k) => k), coef, rhs };
}

describe("separateCoverCut", () => {
    it("returns cuts that hold at every feasible 0/1 point and are violated at the LP point", () => {
        let found = 0;
        let lifted = 0;
        for (let trial = 0; trial < 600; trial++) {
            const n = 3 + Math.floor(random() * 8);
            const row = randomRow(n);
            // A fractional point that satisfies the row (scaled towards 0/1 corners).
            const x = Array.from({ length: n }, () => {
                const r = random();
                return r < 0.35 ? 1 : r < 0.5 ? 0 : random();
            });
            const data = (v: number): CoverVariable => ({ lb: 0, ub: 1, x: x[v], integer: true });
            const cut = separateCoverCut(row, data);
            if (cut === null) continue;
            found++;
            const lhsAt = (point: number[]): number => {
                let lhs = 0;
                for (const [v, a] of cut.alpha) lhs += a * point[v];
                return lhs;
            };
            expect(lhsAt(x), `trial ${trial}`).toBeGreaterThan(cut.beta + 1e-9);
            if ([...cut.alpha.values()].some((a) => Math.abs(a) > 1)) lifted++;
            for (let mask = 0; mask < 1 << n; mask++) {
                const point = Array.from({ length: n }, (_, k) => (mask >> k) & 1);
                const activity = row.coef.reduce((s, a, k) => s + a * point[k], 0);
                if (activity > row.rhs) continue;
                expect(lhsAt(point), `trial ${trial} mask ${mask}`).toBeLessThanOrEqual(
                    cut.beta + 1e-9
                );
            }
        }
        expect(found).toBeGreaterThan(50);
        expect(lifted).toBeGreaterThan(0);
    });

    it("moves fixed variables to the right-hand side and skips non-binary rows", () => {
        const row = { index: [0, 1, 2, 3], coef: [5, 5, 5, 4], rhs: 13 };
        const values = [1, 0.9, 0.9, 1];
        // x3 fixed at 1 leaves 5 x0 + 5 x1 + 5 x2 <= 9: any two form a cover.
        const fixed = (v: number): CoverVariable =>
            v === 3
                ? { lb: 1, ub: 1, x: 1, integer: true }
                : { lb: 0, ub: 1, x: values[v], integer: true };
        const cut = separateCoverCut(row, fixed);
        expect(cut).not.toBeNull();
        expect(cut!.alpha.has(3)).toBe(false);
        expect(cut!.beta).toBe(1);

        const continuous = (v: number): CoverVariable => ({
            lb: 0,
            ub: 1,
            x: values[v],
            integer: v !== 0,
        });
        expect(separateCoverCut(row, continuous)).toBeNull();
        const general = (v: number): CoverVariable => ({
            lb: 0,
            ub: 3,
            x: values[v],
            integer: true,
        });
        expect(separateCoverCut(row, general)).toBeNull();
    });
});
