import type Tableau from "./tableau";
import type { Branch, BranchCut } from "./types";
import { BranchMinHeap } from "./min-heap";

export interface BranchAndCutService {
    applyCuts(tableau: Tableau, branchingCuts: BranchCut[]): void;
    branchAndCut(tableau: Tableau): void;
}

function createCut(type: BranchCut["type"], varIndex: number, value: number): BranchCut {
    return { type, varIndex, value };
}

function createBranch(relaxedEvaluation: number, cuts: BranchCut[]): Branch {
    return { relaxedEvaluation, cuts };
}

export function createBranchAndCutService(): BranchAndCutService {
    const applyCuts = (tableau: Tableau, branchingCuts: BranchCut[]): void => {
        tableau.restore();

        tableau.addCutConstraints(branchingCuts);
        tableau.simplex();
        if (tableau.model?.useMIRCuts) {
            let fractionalVolumeImproved = true;
            while (fractionalVolumeImproved) {
                const fractionalVolumeBefore = tableau.computeFractionalVolume(true);
                tableau.applyMIRCuts();
                tableau.simplex();

                const fractionalVolumeAfter = tableau.computeFractionalVolume(true);

                if (fractionalVolumeAfter >= 0.9 * fractionalVolumeBefore) {
                    fractionalVolumeImproved = false;
                }
            }
        }
    };

    const branchAndCut = (tableau: Tableau): void => {
        const branches = new BranchMinHeap();
        let iterations = 0;
        const tolerance = tableau.model?.tolerance ?? 0;
        let toleranceFlag = true;
        let terminalTime = 1e99;

        if (tableau.model?.timeout) {
            terminalTime = Date.now() + tableau.model.timeout;
        }

        let bestEvaluation = Infinity;
        let bestBranch: Branch | null = null;
        const bestOptionalObjectivesEvaluations: number[] = [];
        for (let oInit = 0; oInit < tableau.optionalObjectives.length; oInit += 1) {
            bestOptionalObjectivesEvaluations.push(Infinity);
        }

        const branch = createBranch(-Infinity, []);
        let acceptableThreshold: number;

        branches.push(branch);
        while (!branches.isEmpty() && toleranceFlag === true && Date.now() < terminalTime) {
            if (tableau.model?.isMinimization) {
                acceptableThreshold = tableau.bestPossibleEval * (1 + tolerance);
            } else {
                acceptableThreshold = tableau.bestPossibleEval * (1 - tolerance);
            }

            if (tolerance > 0) {
                if (bestEvaluation < acceptableThreshold) {
                    toleranceFlag = false;
                }
            }

            const activeBranch = branches.pop()!;
            if (activeBranch.relaxedEvaluation > bestEvaluation) {
                continue;
            }

            const cuts = activeBranch.cuts;
            applyCuts(tableau, cuts);

            iterations++;
            if (tableau.feasible === false) {
                continue;
            }

            const evaluation = tableau.evaluation;
            if (evaluation > bestEvaluation) {
                continue;
            }

            if (evaluation === bestEvaluation) {
                let isCurrentEvaluationWorse = true;
                for (let o = 0; o < tableau.optionalObjectives.length; o += 1) {
                    if (tableau.optionalObjectives[o].reducedCosts[0] > bestOptionalObjectivesEvaluations[o]) {
                        break;
                    } else if (
                        tableau.optionalObjectives[o].reducedCosts[0] <
                        bestOptionalObjectivesEvaluations[o]
                    ) {
                        isCurrentEvaluationWorse = false;
                        break;
                    }
                }

                if (isCurrentEvaluationWorse) {
                    continue;
                }
            }

            if (tableau.isIntegral() === true) {
                tableau.__isIntegral = true;

                if (iterations === 1) {
                    tableau.branchAndCutIterations = iterations;
                    return;
                }
                bestBranch = activeBranch;
                bestEvaluation = evaluation;
                for (let oCopy = 0; oCopy < tableau.optionalObjectives.length; oCopy += 1) {
                    bestOptionalObjectivesEvaluations[oCopy] =
                        tableau.optionalObjectives[oCopy].reducedCosts[0];
                }

                if (tableau.model?.keep_solutions) {
                    const nowSolution = tableau.model.tableau.getSolution();
                    const store = nowSolution.generateSolutionSet();
                    store.result = nowSolution.evaluation;

                    if (!tableau.model.solutions) {
                        tableau.model.solutions = [];
                    }

                    tableau.model.solutions.push(store);
                }
            } else {
                if (iterations === 1) {
                    tableau.save();
                }

                const variable = tableau.getMostFractionalVar();

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
            }
        }

        if (bestBranch !== null) {
            applyCuts(tableau, bestBranch.cuts);
        }
        tableau.branchAndCutIterations = iterations;
    };

    return { applyCuts, branchAndCut };
}
