import "./simplex";
import "./cuttingStrategies";
import "./dynamicModification";
import "./log";
import "./backup";
import "./branchingStrategies";
import "./integerProperties";

import Tableau from "./Tableau";

declare const module: { exports: unknown } | undefined;

export default Tableau;

if (typeof module !== "undefined") {
    module.exports = Tableau;
}
