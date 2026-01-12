/**
 * Test presolve impact on specific problems
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
console.log(`Testing presolve impact: ${model.name || testFile}\n`);

const iterations = 3;

// Test without presolve
console.log("Without presolve:");
let times: number[] = [];
for (let i = 0; i < iterations; i++) {
    const testModel = { ...model, presolve: false };
    const start = performance.now();
    solver.Solve(testModel);
    times.push(performance.now() - start);
}
console.log(`  Avg: ${(times.reduce((a, b) => a + b, 0) / iterations).toFixed(2)} ms`);

// Test with presolve
console.log("\nWith presolve:");
times = [];
for (let i = 0; i < iterations; i++) {
    const testModel = { ...model, presolve: true };
    const start = performance.now();
    solver.Solve(testModel);
    times.push(performance.now() - start);
}
console.log(`  Avg: ${(times.reduce((a, b) => a + b, 0) / iterations).toFixed(2)} ms`);
