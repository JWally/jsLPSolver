/**
 * @file src/tableau/index.ts
 * @description Tableau module entry point
 *
 * Exports the Tableau class and related types. The Tableau is the core
 * data structure representing the simplex tableau, providing methods for:
 * - LP solving via the simplex algorithm
 * - MIP solving via branch-and-cut
 * - Dynamic model modification
 * - Cutting plane generation
 */
import Tableau from "./tableau";

export { createBranchAndCutService } from "./branch-and-cut";
export { Solution, MilpSolution } from "./solution";

export type {
    BoundType,
    Branch,
    BranchCut,
    OptionalObjective,
    SavedState,
    TableauSolution,
    TableauSolutionSet,
    VariableValue,
} from "./types";

export default Tableau;
export { Tableau };
