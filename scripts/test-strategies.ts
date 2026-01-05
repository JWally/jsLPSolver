/**
 * Test different solver strategies on specific problems
 */
import fs from "fs";
import path from "path";
import solver from "../src/main";
import type { Model } from "../src/types/solver";

const testFile = process.argv[2] || "Vendor Selection.json";
const testPath = path.join(__dirname, "../test/test-sanity", testFile);

if (!fs.existsSync(testPath)) {
    console.error(`File not found: ${testPath}`);
    process.exit(1);
}

const model: Model = JSON.parse(fs.readFileSync(testPath, "utf-8"));
console.log(`Testing strategies on: ${model.name || testFile}\n`);

interface StrategyResult {
    name: string;
    time: number;
    result: number;
    feasible: boolean;
}

const strategies: Array<{ name: string; options: Model["options"] }> = [
    { name: "Default (heap)", options: undefined },
    {
        name: "Hybrid + Most Fractional",
        options: { nodeSelection: "hybrid", branching: "most-fractional" },
    },
    { name: "Hybrid + Pseudocost", options: { nodeSelection: "hybrid", branching: "pseudocost" } },
    {
        name: "Depth-first + Pseudocost",
        options: { nodeSelection: "depth-first", branching: "pseudocost" },
    },
    {
        name: "Best-first + Pseudocost",
        options: { nodeSelection: "best-first", branching: "pseudocost" },
    },
];

const results: StrategyResult[] = [];

for (const strategy of strategies) {
    const testModel = { ...model, options: strategy.options };

    // Warm up
    solver.Solve(testModel);

    // Time it
    const runs = 3;
    let totalTime = 0;
    let lastResult: any;

    for (let i = 0; i < runs; i++) {
        const start = performance.now();
        lastResult = solver.Solve(testModel);
        totalTime += performance.now() - start;
    }

    results.push({
        name: strategy.name,
        time: totalTime / runs,
        result: lastResult.result,
        feasible: lastResult.feasible,
    });
}

// Print results
console.log(
    "Strategy".padEnd(35) +
        "Time (ms)".padStart(12) +
        "Result".padStart(15) +
        "Feasible".padStart(10)
);
console.log("-".repeat(72));

for (const r of results) {
    console.log(
        r.name.padEnd(35) +
            r.time.toFixed(2).padStart(12) +
            r.result.toFixed(2).padStart(15) +
            (r.feasible ? "Yes" : "No").padStart(10)
    );
}

// Find best
const best = results.reduce((a, b) => (a.time < b.time ? a : b));
console.log(`\nBest: ${best.name} at ${best.time.toFixed(2)}ms`);
