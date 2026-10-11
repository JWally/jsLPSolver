/**
 * Child-process entry for the MIPLIB root-LP tests: build the model (integer
 * columns get column bounds), solve only the root LP relaxation and print the
 * outcome as JSON. Run out of process so a hang can be killed by a timeout.
 */
import fs from "fs";
import Model from "../../src/model";

const model = new Model().loadJson(JSON.parse(fs.readFileSync(process.argv[2], "utf8")));
const tableau = model.tableau;
tableau.setModel(model);
tableau.simplex();
const sign = model.isMinimization ? 1 : -1;
process.stdout.write(
    JSON.stringify({
        feasible: tableau.feasible,
        hasBounds: tableau.hasBounds,
        result: sign * tableau.evaluation,
    })
);
