import type Tableau from "./tableau";
import Solution from "./solution";

class MilpSolution extends Solution {
    iter: number;

    constructor(
        tableau: Tableau,
        evaluation: number,
        feasible: boolean,
        bounded: boolean,
        branchAndCutIterations: number
    ) {
        super(tableau, evaluation, feasible, bounded);
        this.iter = branchAndCutIterations;
    }
}

export default MilpSolution;
