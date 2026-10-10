/**
 * Child-process entry for the Netlib regression tests: solve one fixture and
 * print the outcome as JSON. Run out of process so a solver hang can be
 * killed by a timeout instead of freezing the test worker.
 */
import fs from "fs";
import solver from "../../src/solver";

const model = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const result = solver.Solve(model) as { feasible: boolean; bounded?: boolean; result: number };
process.stdout.write(
    JSON.stringify({ feasible: result.feasible, bounded: result.bounded, result: result.result })
);
