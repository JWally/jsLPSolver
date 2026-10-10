/**
 * Branch-and-cut must be deterministic: the same model gives the same tree
 * and the same answer regardless of machine speed. Node-resume decisions used
 * to compare measured milliseconds, so busy or slow runs explored different
 * trees (MIPLIB noswot: 14s on one run, >60s on the next). A fake clock can't
 * reliably expose that (the measurements scale together), so the contract is
 * structural: without a timeout option, solving never reads the clock.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import solver from "../solver";

const SANITY = path.join(__dirname, "..", "..", "test", "test-sanity");

function load(file: string): Record<string, unknown> {
    const model = JSON.parse(fs.readFileSync(path.join(SANITY, file), "utf8"));
    delete model.options?.timeout;
    delete model.timeout;
    return model;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("branch-and-cut determinism", () => {
    for (const file of ["LargeFarmMIP.json", "Knapsack 1.json", "Monster_II.json"]) {
        it(`${file}: no clock reads without a timeout`, () => {
            const perfNow = vi.spyOn(performance, "now");
            const dateNow = vi.spyOn(Date, "now");
            const result = solver.Solve(load(file) as never) as { feasible: boolean };
            expect(result.feasible).toBe(true);
            expect(perfNow).not.toHaveBeenCalled();
            expect(dateNow).not.toHaveBeenCalled();
        });

        it(`${file}: repeated solves give the same tree and answer`, () => {
            const first = solver.Solve(load(file) as never);
            const firstNodes = solver.lastSolvedModel!.tableau.branchAndCutIterations;
            const second = solver.Solve(load(file) as never);
            expect(solver.lastSolvedModel!.tableau.branchAndCutIterations).toBe(firstNodes);
            expect(second).toEqual(first);
        });
    }
});
