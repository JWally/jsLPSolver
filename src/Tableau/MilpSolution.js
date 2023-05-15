import Solution from "./Solution.js";

export default class MilpSolution extends Solution {
    constructor(tableau, evaluation, feasible, bounded, branchAndCutIterations) {
        super(tableau, evaluation, feasible, bounded);
        this.iter = branchAndCutIterations;
    }
}
