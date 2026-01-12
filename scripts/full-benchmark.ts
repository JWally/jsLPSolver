/**
 * Comprehensive benchmark for jsLPSolver
 * Run with: npx tsx scripts/full-benchmark.ts
 */
import solver from "../src/solver";
import {
    generateRandomLP,
    generateRandomMIP,
    generateKnapsack,
} from "../src/test-utils/problem-generator";

interface BenchmarkResult {
    name: string;
    times: number[];
    avg: number;
    min: number;
    max: number;
}

function benchmark(
    name: string,
    problem: any,
    iterations: number,
    runs: number = 3
): BenchmarkResult {
    const times: number[] = [];

    for (let run = 0; run < runs; run++) {
        // Warmup
        for (let i = 0; i < 3; i++) {
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
    const min = Math.min(...times);
    const max = Math.max(...times);

    return { name, times, avg, min, max };
}

function formatResult(r: BenchmarkResult): string {
    return `${r.name.padEnd(35)} ${r.avg.toFixed(3).padStart(10)} ms  (${r.min.toFixed(3)}-${r.max.toFixed(3)})`;
}

console.log("jsLPSolver Full Benchmark (3 runs each)");
console.log("=".repeat(75));
console.log("");

// LP Problems
const smallLP = generateRandomLP({
    seed: 12345,
    numVariables: 20,
    numConstraints: 10,
    density: 0.6,
});
const mediumLP = generateRandomLP({
    seed: 12345,
    numVariables: 100,
    numConstraints: 50,
    density: 0.4,
});
const largeLP = generateRandomLP({
    seed: 12345,
    numVariables: 300,
    numConstraints: 150,
    density: 0.3,
});

console.log("LP Problems:");
console.log(formatResult(benchmark("Small LP (20x10)", smallLP, 500)));
console.log(formatResult(benchmark("Medium LP (100x50)", mediumLP, 50)));
console.log(formatResult(benchmark("Large LP (300x150)", largeLP, 10)));
console.log("");

// MIP Problems
const smallMIP = generateRandomMIP({
    seed: 12345,
    numVariables: 15,
    numConstraints: 8,
    integerFraction: 0.3,
    density: 0.5,
});
const mediumMIP = generateRandomMIP({
    seed: 12345,
    numVariables: 25,
    numConstraints: 12,
    integerFraction: 0.3,
    density: 0.5,
});
const knapsack = generateKnapsack({ seed: 12345, numVariables: 20 });

console.log("MIP Problems (generated):");
console.log(formatResult(benchmark("Small MIP (15x8, 30% int)", smallMIP, 50)));
console.log(formatResult(benchmark("Medium MIP (25x12, 30% int)", mediumMIP, 30)));
console.log(formatResult(benchmark("Knapsack (20 items)", knapsack, 50)));
console.log("");

// Real-world test problems
const monsterProblem = require("../test/test-sanity/Monster Problem.json");
const monsterII = require("../test/test-sanity/Monster_II.json");
const vendorSelection = require("../test/test-sanity/Vendor Selection.json");

console.log("Real-world MIP Problems:");
console.log(formatResult(benchmark("Monster Problem", monsterProblem, 20)));
console.log(formatResult(benchmark("Monster II (large MIP)", monsterII, 5)));
console.log(formatResult(benchmark("Vendor Selection (slow)", vendorSelection, 3)));
console.log("");

console.log("=".repeat(75));
