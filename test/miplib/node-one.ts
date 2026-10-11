/**
 * Child-process entry for the MIPLIB node-LP tests: solve the root LP, then
 * one branch-and-bound node's LP the way branch-and-cut does and print the
 * outcome as JSON. Modes: "cold" restores the saved root and tightens every
 * bound (Tableau.applyCuts); "warm" cold-solves the parent (all bounds but
 * the last) and tightens the last bound in place, like a dive.
 */
import fs from "fs";
import Model from "../../src/model";
import { lowerBoundOf, setVariableBounds, upperBoundOf } from "../../src/tableau/bounds";
import type { BranchCut } from "../../src/tableau/types";

const [modelFile, nodesFile, nodeId, mode] = process.argv.slice(2);
const model = new Model().loadJson(JSON.parse(fs.readFileSync(modelFile, "utf8")));
const tableau = model.tableau;
tableau.setModel(model);
tableau.simplex();
tableau.save();

const indexById = new Map(model.variables.map((v) => [v.id, v.index]));
const node: Array<{ id: string; type: BranchCut["type"]; value: number }> = JSON.parse(
    fs.readFileSync(nodesFile, "utf8")
)[nodeId];
const cuts: BranchCut[] = node.map((c) => ({
    type: c.type,
    varIndex: indexById.get(c.id)!,
    value: c.value,
}));

if (mode === "warm") {
    tableau.applyCuts(cuts.slice(0, -1));
    const last = cuts[cuts.length - 1];
    let lb = lowerBoundOf(tableau, last.varIndex);
    let ub = upperBoundOf(tableau, last.varIndex);
    if (last.type === "min") lb = Math.max(lb, last.value);
    else ub = Math.min(ub, last.value);
    setVariableBounds(tableau, last.varIndex, lb, ub);
    tableau.simplex();
} else {
    tableau.applyCuts(cuts);
}
const sign = model.isMinimization ? 1 : -1;
process.stdout.write(
    JSON.stringify({ feasible: tableau.feasible, result: sign * tableau.evaluation })
);
