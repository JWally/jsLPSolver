/**
 * Netlib LP regression tests.
 *
 * Fixtures in test/netlib are classic Netlib LPs converted from MPS (variable
 * bounds become constraint rows; objective constants are dropped). Expected
 * optima were computed by HiGHS on the converted JSON models. These problems
 * exposed hangs, false infeasibility and false unboundedness in the simplex
 * phases, so each solve runs in a child process with a timeout.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import path from "path";

const ROOT = path.join(__dirname, "..");
const TIMEOUT_MS = 20000;

const EXPECTED: Record<string, number> = {
    afiro: -464.75314285714285,
    agg: -35991767.286576495,
    boeing2: -315.0187280152027,
    bore3d: 1373.080394208493,
    brandy: 1518.5098964881286,
    capri: 2690.0129137681606,
    e226: -18.751929066370536,
    scagr25: -14753433.060768528,
    share1b: -76589.31857918571,
    share2b: -415.7322407414195,
};

function solveInChild(name: string): { feasible: boolean; bounded?: boolean; result: number } {
    const child = spawnSync(
        process.execPath,
        [
            "-r",
            "./scripts/ts-node-register.js",
            "test/netlib/solve-one.ts",
            `test/netlib/${name}.json`,
        ],
        { cwd: ROOT, timeout: TIMEOUT_MS, encoding: "utf8" }
    );
    if (child.error || child.status !== 0) {
        throw new Error(
            `${name}: solver did not finish (${child.error?.message ?? `exit ${child.status}`})`
        );
    }
    return JSON.parse(child.stdout);
}

describe("Netlib LP regressions", () => {
    for (const [name, optimum] of Object.entries(EXPECTED)) {
        it(`solves ${name} to its optimum`, { timeout: TIMEOUT_MS + 10000 }, () => {
            const outcome = solveInChild(name);
            expect(outcome.feasible, "feasible").toBe(true);
            expect(outcome.bounded, "bounded").not.toBe(false);
            const relativeError = Math.abs(outcome.result - optimum) / Math.max(1, Math.abs(optimum));
            expect(relativeError, `result ${outcome.result} vs ${optimum}`).toBeLessThan(1e-6);
        });
    }
});
