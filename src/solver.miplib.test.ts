/**
 * MIPLIB root-LP regression tests.
 *
 * Fixtures in test/miplib are MIPLIB 3 instances converted from MPS. Their
 * integer columns take the column-bounds path (bounds.ts), so the root LP
 * exercises bounded phase 1 on models far larger than the unit tests. Expected
 * values are the LP relaxations computed by HiGHS. Each solve runs in a child
 * process with a timeout so a hang fails instead of freezing the worker.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import path from "path";

const ROOT = path.join(__dirname, "..");
const TIMEOUT_MS = 20000;

const ROOT_LP: Record<string, number> = {
    // Bounded dual phase 1 was cut off at its iteration budget while the
    // objective was still climbing, and the fallback reported infeasible.
    qnet1: 14274.102667094436,
};

function solveRootInChild(name: string): { feasible: boolean; hasBounds: boolean; result: number } {
    const child = spawnSync(
        process.execPath,
        [
            "-r",
            "./scripts/ts-node-register.js",
            "test/miplib/root-one.ts",
            `test/miplib/${name}.json`,
        ],
        { cwd: ROOT, timeout: TIMEOUT_MS, encoding: "utf8" }
    );
    if (child.error || child.status !== 0) {
        throw new Error(
            `${name}: root LP did not finish (${child.error?.message ?? `exit ${child.status}`})`
        );
    }
    return JSON.parse(child.stdout);
}

// Branch-and-bound node LPs of MIPLIB blend2 (bounds dumped from a real
// tree), with optima computed by HiGHS. Wrong node LPs made branch-and-cut
// prune the optimum (blend2 returned 13.86; optimum 7.599).
// - 62, 553 (cold) and 106 (warm) fail on the old dual ratio test, which
//   pivoted on tiny entries until the tableau lost consistency.
// - 428 and 510 (cold) guard the fixes made along the way: an improving
//   column hidden under the optimality tolerance by a row whose
//   coefficients reach 7243 (row equilibration), and Harris tolerances that
//   phase 1 did not honor.
const BLEND2_NODES: Array<[string, "cold" | "warm", number]> = [
    ["62", "cold", 7.620086],
    ["106", "warm", 8.944404],
    ["428", "cold", 7.500279008673795],
    ["510", "cold", 9.687007831492721],
    ["553", "cold", 11.757794693041914],
];

function solveNodeInChild(id: string, mode: string): { feasible: boolean; result: number } {
    const child = spawnSync(
        process.execPath,
        [
            "-r",
            "./scripts/ts-node-register.js",
            "test/miplib/node-one.ts",
            "test/miplib/blend2.json",
            "test/miplib/blend2-nodes.json",
            id,
            mode,
        ],
        { cwd: ROOT, timeout: TIMEOUT_MS, encoding: "utf8" }
    );
    if (child.error || child.status !== 0) {
        throw new Error(
            `blend2 node ${id}: did not finish (${child.error?.message ?? `exit ${child.status}`})`
        );
    }
    return JSON.parse(child.stdout);
}

describe("MIPLIB node LP regressions", () => {
    for (const [id, mode, optimum] of BLEND2_NODES) {
        it(`solves blend2 node ${id} (${mode})`, { timeout: TIMEOUT_MS + 10000 }, () => {
            const outcome = solveNodeInChild(id, mode);
            expect(outcome.feasible, "feasible").toBe(true);
            const relativeError =
                Math.abs(outcome.result - optimum) / Math.max(1, Math.abs(optimum));
            expect(relativeError, `result ${outcome.result} vs ${optimum}`).toBeLessThan(1e-6);
        });
    }
});

describe("MIPLIB root LP regressions", () => {
    for (const [name, relaxation] of Object.entries(ROOT_LP)) {
        it(`solves the ${name} root LP with column bounds`, { timeout: TIMEOUT_MS + 10000 }, () => {
            const outcome = solveRootInChild(name);
            expect(outcome.hasBounds, "uses column bounds").toBe(true);
            expect(outcome.feasible, "feasible").toBe(true);
            const relativeError =
                Math.abs(outcome.result - relaxation) / Math.max(1, Math.abs(relaxation));
            expect(relativeError, `result ${outcome.result} vs ${relaxation}`).toBeLessThan(1e-6);
        });
    }
});
