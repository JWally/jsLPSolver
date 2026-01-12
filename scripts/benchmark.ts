/**
 * Performance benchmark for jsLPSolver
 * Run with: npx tsx scripts/benchmark.ts
 */
import solver from "../src/solver";
import {
    generateRandomLP,
    generateRandomMIP,
    generateKnapsack,
} from "../src/test-utils/problem-generator";

interface BenchmarkResult {
    name: string;
    iterations: number;
    totalTime: number;
    avgTime: number;
    opsPerSecond: number;
}

function benchmark(name: string, fn: () => void, iterations: number = 100): BenchmarkResult {
    // Warmup
    for (let i = 0; i < 5; i++) {
        fn();
    }

    // Benchmark
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
        fn();
    }
    const end = performance.now();

    const totalTime = end - start;
    const avgTime = totalTime / iterations;
    const opsPerSecond = 1000 / avgTime;

    return { name, iterations, totalTime, avgTime, opsPerSecond };
}

function formatResult(result: BenchmarkResult): string {
    return `${result.name.padEnd(40)} ${result.avgTime.toFixed(3).padStart(10)} ms | ${result.opsPerSecond.toFixed(1).padStart(8)} ops/s`;
}

console.log("jsLPSolver Performance Benchmark");
console.log("=".repeat(70));
console.log("");

// Small LP problems
const smallLP = generateRandomLP({
    seed: 12345,
    numVariables: 20,
    numConstraints: 10,
    density: 0.6,
});

const result1 = benchmark(
    "Small LP (20x10)",
    () => {
        solver.Solve(smallLP);
    },
    1000
);
console.log(formatResult(result1));

// Medium LP problems
const mediumLP = generateRandomLP({
    seed: 12345,
    numVariables: 100,
    numConstraints: 50,
    density: 0.4,
});

const result2 = benchmark(
    "Medium LP (100x50)",
    () => {
        solver.Solve(mediumLP);
    },
    100
);
console.log(formatResult(result2));

// Large LP problems
const largeLP = generateRandomLP({
    seed: 12345,
    numVariables: 300,
    numConstraints: 150,
    density: 0.3,
});

const result3 = benchmark(
    "Large LP (300x150)",
    () => {
        solver.Solve(largeLP);
    },
    20
);
console.log(formatResult(result3));

console.log("");

// Small MIP problems
const smallMIP = generateRandomMIP({
    seed: 12345,
    numVariables: 15,
    numConstraints: 8,
    integerFraction: 0.3,
    density: 0.5,
});

const result4 = benchmark(
    "Small MIP (15x8, 30% int)",
    () => {
        solver.Solve(smallMIP);
    },
    100
);
console.log(formatResult(result4));

// Medium MIP problems
const mediumMIP = generateRandomMIP({
    seed: 12345,
    numVariables: 25,
    numConstraints: 12,
    integerFraction: 0.3,
    density: 0.5,
});

const result5 = benchmark(
    "Medium MIP (25x12, 30% int)",
    () => {
        solver.Solve(mediumMIP);
    },
    50
);
console.log(formatResult(result5));

console.log("");

// Knapsack problems
const knapsack20 = generateKnapsack({
    seed: 12345,
    numVariables: 20,
});

const result6 = benchmark(
    "Knapsack (20 items)",
    () => {
        solver.Solve(knapsack20);
    },
    50
);
console.log(formatResult(result6));

console.log("");
console.log("=".repeat(70));
console.log("Benchmark complete");
