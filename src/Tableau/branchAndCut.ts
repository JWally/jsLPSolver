import Tableau from "./Tableau";
import type { Branch, BranchCut } from "./types";

function createCut(type: BranchCut["type"], varIndex: number, value: number): BranchCut {
    return { type, varIndex, value };
}

function createBranch(relaxedEvaluation: number, cuts: BranchCut[]): Branch {
    return { relaxedEvaluation, cuts };
}

function sortByEvaluation(a: Branch, b: Branch): number {
    return b.relaxedEvaluation - a.relaxedEvaluation;
}

Tableau.prototype.applyCuts = function applyCuts(this: Tableau, branchingCuts: BranchCut[]): void {
    this.restore();

    this.addCutConstraints(branchingCuts);
    this.simplex();
    if (this.model.useMIRCuts) {
        let fractionalVolumeImproved = true;
        while (fractionalVolumeImproved) {
            const fractionalVolumeBefore = this.computeFractionalVolume(true);
            this.applyMIRCuts();
            this.simplex();

            const fractionalVolumeAfter = this.computeFractionalVolume(true);

            if (fractionalVolumeAfter >= 0.9 * fractionalVolumeBefore) {
                fractionalVolumeImproved = false;
            }
        }
    }
};

Tableau.prototype.branchAndCut = function branchAndCut(this: Tableau): void {
    const branches: Branch[] = [];
    let iterations = 0;
    const tolerance = this.model.tolerance ?? 0;
    let toleranceFlag = true;
    let terminalTime = 1e99;

    if (this.model.timeout) {
        terminalTime = Date.now() + this.model.timeout;
    }

    let bestEvaluation = Infinity;
    let bestBranch: Branch | null = null;
    const bestOptionalObjectivesEvaluations: number[] = [];
    for (let oInit = 0; oInit < this.optionalObjectives.length; oInit += 1) {
        bestOptionalObjectivesEvaluations.push(Infinity);
    }

    const branch = createBranch(-Infinity, []);
    let acceptableThreshold: number;

    branches.push(branch);
    while (branches.length > 0 && toleranceFlag === true && Date.now() < terminalTime) {
        if (this.model.isMinimization) {
            acceptableThreshold = this.bestPossibleEval * (1 + tolerance);
        } else {
            acceptableThreshold = this.bestPossibleEval * (1 - tolerance);
        }

        if (tolerance > 0) {
            if (bestEvaluation < acceptableThreshold) {
                toleranceFlag = false;
            }
        }

        const activeBranch = branches.pop() as Branch;
        if (activeBranch.relaxedEvaluation > bestEvaluation) {
            continue;
        }

        const cuts = activeBranch.cuts;
        this.applyCuts(cuts);

        iterations++;
        if (this.feasible === false) {
            continue;
        }

        const evaluation = this.evaluation;
        if (evaluation > bestEvaluation) {
            continue;
        }

        if (evaluation === bestEvaluation) {
            let isCurrentEvaluationWorse = true;
            for (let o = 0; o < this.optionalObjectives.length; o += 1) {
                if (this.optionalObjectives[o].reducedCosts[0] > bestOptionalObjectivesEvaluations[o]) {
                    break;
                } else if (this.optionalObjectives[o].reducedCosts[0] < bestOptionalObjectivesEvaluations[o]) {
                    isCurrentEvaluationWorse = false;
                    break;
                }
            }

            if (isCurrentEvaluationWorse) {
                continue;
            }
        }

        if (this.isIntegral() === true) {
            this.__isIntegral = true;

            if (iterations === 1) {
                this.branchAndCutIterations = iterations;
                return;
            }
            bestBranch = activeBranch;
            bestEvaluation = evaluation;
            for (let oCopy = 0; oCopy < this.optionalObjectives.length; oCopy += 1) {
                bestOptionalObjectivesEvaluations[oCopy] = this.optionalObjectives[oCopy].reducedCosts[0];
            }

            if (this.model.keep_solutions) {
                const nowSolution = this.model.tableau.getSolution();
                const store = nowSolution.generateSolutionSet();
                store.result = nowSolution.evaluation;

                if (!this.model.solutions) {
                    this.model.solutions = [];
                }

                this.model.solutions.push(store);
            }
        } else {
            if (iterations === 1) {
                this.save();
            }

            const variable = this.getMostFractionalVar();

            const varIndex = variable.index as number;

            const cutsHigh: BranchCut[] = [];
            const cutsLow: BranchCut[] = [];

            const nCuts = cuts.length;
            for (let c = 0; c < nCuts; c += 1) {
                const cut = cuts[c];
                if (cut.varIndex === varIndex) {
                    if (cut.type === "min") {
                        cutsLow.push(cut);
                    } else {
                        cutsHigh.push(cut);
                    }
                } else {
                    cutsHigh.push(cut);
                    cutsLow.push(cut);
                }
            }

            const min = Math.ceil(variable.value as number);
            const max = Math.floor(variable.value as number);

            const cutHigh = createCut("min", varIndex, min);
            cutsHigh.push(cutHigh);

            const cutLow = createCut("max", varIndex, max);
            cutsLow.push(cutLow);

            branches.push(createBranch(evaluation, cutsHigh));
            branches.push(createBranch(evaluation, cutsLow));

            branches.sort(sortByEvaluation);
        }
    }

    if (bestBranch !== null) {
        this.applyCuts(bestBranch.cuts);
    }
    this.branchAndCutIterations = iterations;
};
