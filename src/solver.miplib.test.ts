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
