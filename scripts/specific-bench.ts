import solver from "../src/solver";

function benchmark(name: string, problem: any, iterations: number = 10): void {
    // Warmup
    for (let i = 0; i < 3; i++) {
        solver.Solve(problem);
    }

    // Benchmark
    const start = performance.now();
    let result;
    for (let i = 0; i < iterations; i++) {
        result = solver.Solve(problem);
    }
    const end = performance.now();

    const avgTime = (end - start) / iterations;
    const nameStr = name.padEnd(35);
    const timeStr = avgTime.toFixed(2).padStart(10);
    const resultVal = result.result?.toFixed(2) || "N/A";
    console.log(`${nameStr} ${timeStr} ms  (feasible: ${result.feasible}, result: ${resultVal})`);
}

const monsterII = require("../test/test-sanity/Monster_II.json");
const vendorSelection = require("../test/test-sanity/Vendor Selection.json");
const monsterProblem = require("../test/test-sanity/Monster Problem.json");

console.log("Specific Problem Benchmarks");
console.log("=".repeat(70));
console.log("");

benchmark("Monster Problem", monsterProblem, 20);
benchmark("Monster II (large MIP)", monsterII, 5);
benchmark("Vendor Selection (slow)", vendorSelection, 3);

console.log("");
console.log("=".repeat(70));
