/**
 * Tableau module - Core data structure for the simplex algorithm.
 *
 * The Tableau class represents the simplex tableau and provides methods for:
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
