/**
 * Break down where time is spent
 */
import fs from "fs";
import path from "path";
import Model from "../src/model";
import type { Model as ModelDef } from "../src/types/solver";

const testFile = process.argv[2] || "Vendor Selection.json";
const testPath = path.join(__dirname, "../test/test-sanity", testFile);

if (!fs.existsSync(testPath)) {
    console.error(`File not found: ${testPath}`);
    process.exit(1);
}

const modelDef: ModelDef = JSON.parse(fs.readFileSync(testPath, "utf-8"));
console.log(`Problem: ${modelDef.name || testFile}\n`);

// Use Model class directly to get more control
const model = new Model();

// Time model loading
let start = performance.now();
model.loadJson(modelDef);
const loadTime = performance.now() - start;
console.log(`Model loading: ${loadTime.toFixed(2)} ms`);

// Time tableau initialization (done within solve)
start = performance.now();
model.tableau.setModel(model);
const initTime = performance.now() - start;
console.log(`Tableau init: ${initTime.toFixed(2)} ms`);

// Tableau dimensions
console.log(`\nTableau dimensions: ${model.tableau.width} x ${model.tableau.height}`);

// Time simplex solve
start = performance.now();
model.tableau.simplex();
const simplexTime = performance.now() - start;
console.log(`Initial simplex: ${simplexTime.toFixed(2)} ms`);

// Check if MIP
const hasMIP = model.integerVariables.length > 0;
console.log(`\nInteger vars: ${model.integerVariables.length}`);

if (hasMIP) {
    // Time B&C
    start = performance.now();
    model.tableau.branchAndCutService.branchAndCut(model.tableau);
    const bacTime = performance.now() - start;
    console.log(`Branch and Cut: ${bacTime.toFixed(2)} ms`);
    console.log(`B&C iterations: ${model.tableau.branchAndCutIterations}`);
}

console.log(`\nTotal overhead (load + init): ${(loadTime + initTime).toFixed(2)} ms`);
