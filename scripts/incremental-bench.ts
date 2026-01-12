/**
 * Compare standard vs incremental B&C performance
 */
import solver from "../src/solver";

function benchmark(name: string, problem: any, iterations: number, runs: number = 3): number {
    const times: number[] = [];

    for (let run = 0; run < runs; run++) {
        // Warmup
        for (let i = 0; i < 2; i++) {
            solver.Solve(problem);
        }

        // Benchmark
        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
            solver.Solve(problem);
        }
        const end = performance.now();
        times.push((end - start) / iterations);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`${name.padEnd(50)} ${avg.toFixed(2).padStart(10)} ms`);
    return avg;
}

const monsterII = require("../test/test-sanity/Monster_II.json");
const vendorSelection = require("../test/test-sanity/Vendor Selection.json");

console.log("Comparing Standard vs Incremental B&C");
console.log("=".repeat(70));
console.log("");

// Standard mode
console.log("Standard B&C:");
const m2Standard = benchmark("Monster II", monsterII, 5);
const vsStandard = benchmark("Vendor Selection", vendorSelection, 3);

// Create incremental versions
const monsterIIIncremental = {
    ...monsterII,
    options: { ...monsterII.options, useIncremental: true },
};

const vendorSelectionIncremental = {
    ...vendorSelection,
    options: { ...vendorSelection.options, useIncremental: true },
};

console.log("");
console.log("Incremental B&C (experimental):");
const m2Incremental = benchmark("Monster II (incremental)", monsterIIIncremental, 5);
const vsIncremental = benchmark("Vendor Selection (incremental)", vendorSelectionIncremental, 3);

console.log("");
console.log("Summary:");
console.log(
    `Monster II: ${(((m2Standard - m2Incremental) / m2Standard) * 100).toFixed(1)}% ${m2Incremental < m2Standard ? "faster" : "slower"} with incremental`
);
console.log(
    `Vendor Selection: ${(((vsStandard - vsIncremental) / vsStandard) * 100).toFixed(1)}% ${vsIncremental < vsStandard ? "faster" : "slower"} with incremental`
);
console.log("=".repeat(70));
