import fs from "fs";
import path from "path";
import solver from "../src/main";

const testFiles = ["Vendor Selection.json", "Monster_II.json", "LargeFarmMIP.json"];

for (const file of testFiles) {
    const testPath = path.join(__dirname, "../test/test-sanity", file);
    const model = JSON.parse(fs.readFileSync(testPath, "utf-8"));

    const start = performance.now();
    solver.Solve(model);
    const time = performance.now() - start;

    const iterations = solver.lastSolvedModel?.tableau?.branchAndCutIterations ?? 0;

    console.log(`${model.name || file}:`);
    console.log(`  Time: ${time.toFixed(2)}ms`);
    console.log(`  B&B Iterations: ${iterations}`);
    console.log();
}
