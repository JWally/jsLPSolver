/**
 * Performance ratchet for representative slow bundled problems.
 *
 * This is intentionally small and deterministic enough for local use. Run it
 * without other CPU-heavy jobs in parallel. The caps are conservative: tighten
 * them only after repeated measurements on the same machine show a stable win.
 */
import fs from "fs";
import path from "path";
import solver from "../src/solver";
import type { Model, SolveResult } from "../src/types/solver";

interface Case {
    file: string;
    maxMedianMs: number;
}

const CASES: Case[] = [
    { file: "Vendor Selection.json", maxMedianMs: 650 },
    { file: "Monster_II.json", maxMedianMs: 120 },
    { file: "LargeFarmMIP.json", maxMedianMs: 70 },
];

const WARMUPS = 2;
const SAMPLES = 5;
const SUITE_PATH = path.join(__dirname, "..", "test", "test-sanity");

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

function expectedResult(model: Model): number | undefined {
    return (model as Model & { expects?: { result?: number } }).expects?.result;
}

function assertSolution(file: string, model: Model, result: SolveResult): void {
    if (!result.feasible) {
        throw new Error(`${file}: expected feasible solution`);
    }

    const expected = expectedResult(model);
    if (expected !== undefined && Math.abs((result.result ?? NaN) - expected) > 1e-6) {
        throw new Error(`${file}: expected result ${expected}, got ${result.result}`);
    }
}

let failed = false;

console.log("jsLPSolver performance ratchet");
console.log("=".repeat(72));

for (const testCase of CASES) {
    const model = JSON.parse(
        fs.readFileSync(path.join(SUITE_PATH, testCase.file), "utf8")
    ) as Model;

    for (let i = 0; i < WARMUPS; i++) {
        assertSolution(testCase.file, model, solver.Solve(model) as SolveResult);
    }

    const times: number[] = [];
    let branchAndCutIterations = 0;
    for (let i = 0; i < SAMPLES; i++) {
        const startedAt = performance.now();
        const result = solver.Solve(model) as SolveResult;
        times.push(performance.now() - startedAt);
        assertSolution(testCase.file, model, result);
        branchAndCutIterations = solver.lastSolvedModel?.tableau.branchAndCutIterations ?? 0;
    }

    const med = median(times);
    const avg = times.reduce((sum, value) => sum + value, 0) / times.length;
    const status = med <= testCase.maxMedianMs ? "PASS" : "FAIL";

    if (status === "FAIL") {
        failed = true;
    }

    console.log(
        `${status} ${testCase.file.padEnd(24)} median=${med.toFixed(2).padStart(8)}ms ` +
            `avg=${avg.toFixed(2).padStart(8)}ms ` +
            `nodes=${String(branchAndCutIterations).padStart(5)} ` +
            `cap=${testCase.maxMedianMs.toFixed(2)}ms`
    );
}

console.log("=".repeat(72));

if (failed) {
    process.exit(1);
}
