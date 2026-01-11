/**
 * Check B&B iterations for a problem
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
console.log(`Problem: ${model.name || testFile}\n`);

// Access internal state to check iterations
const result = solver.Solve(model, undefined, true) as any;
console.log(`Feasible: ${result.feasible}`);
console.log(`Bounded: ${result.bounded}`);
console.log(`Result: ${result.result ?? result.evaluation}`);
console.log(`B&C Iterations: ${result.iter || "N/A"}`);

// Check tableau for simplex iterations
const lastModel = solver.lastSolvedModel;
if (lastModel?.tableau) {
    const t = lastModel.tableau;
    console.log(`Simplex Iterations: ${t.simplexIters}`);
    console.log(`Tableau size: ${t.width} x ${t.height}`);
    console.log(`Total cells: ${t.width * t.height}`);

    // Count non-zeros
    let nonZeros = 0;
    for (let i = 0; i < t.matrix.length; i++) {
        if (t.matrix[i] !== 0) nonZeros++;
    }
    console.log(`Non-zeros: ${nonZeros}`);
    console.log(`Density: ${(nonZeros / (t.width * t.height) * 100).toFixed(2)}%`);
}
