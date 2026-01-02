import type Tableau from "./Tableau";
import Solution from "./Solution";

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
