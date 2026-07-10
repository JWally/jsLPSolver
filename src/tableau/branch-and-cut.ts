/**
 * @file src/tableau/branch-and-cut.ts
 * @description Branch-and-cut algorithm for mixed-integer programming
 *
 * Implements the branch-and-bound algorithm with cutting planes to find
 * integer-optimal solutions. Uses a priority queue (min-heap) to explore
 * promising branches first based on relaxed objective values.
 *
 * Key features:
 * - Branching on fractional integer variables
 * - Gomory cuts to tighten LP relaxation
 * - Best-first node selection
 * - Early termination via tolerance
 */
import type Tableau from "./tableau";
import type { Branch, BranchCut } from "./types";
import { BranchMinHeap } from "./min-heap";

/**
 * Interface for branch-and-cut solver services.
 * Implementations provide the strategy for exploring the B&B tree.
 */
export interface BranchAndCutService {
    /** Apply bound cuts and re-solve the LP relaxation. */
    applyCuts(tableau: Tableau, branchingCuts: BranchCut[]): void;
    /** Run the full branch-and-cut algorithm to find an integer-optimal solution. */
    branchAndCut(tableau: Tableau): void;
}

/** Helper to create a BranchCut object. */
function createCut(type: BranchCut["type"], varIndex: number, value: number): BranchCut {
    return { type, varIndex, value };
}

/** Helper to create a Branch node. */
function createBranch(relaxedEvaluation: number, cuts: BranchCut[]): Branch {
    return { relaxedEvaluation, cuts };
}

/**
 * Create the default (basic) branch-and-cut service.
 *
 * Uses best-first node selection via a min-heap, most-fractional branching,
 * and optional MIR cuts. Suitable for small-to-medium MIP instances.
 *
 * @returns A BranchAndCutService with applyCuts and branchAndCut methods.
 */
export function createBranchAndCutService(): BranchAndCutService {
    const applyCuts = (tableau: Tableau, branchingCuts: BranchCut[]): void => {
        tableau.restore();

        if (branchingCuts.length > 0) {
            tableau.addCutConstraints(branchingCuts);
        }
        tableau.simplex();
        if (tableau.model?.useMIRCuts) {
            // Optimization: reuse previous "after" as next "before" to avoid redundant computation
            let fractionalVolume = tableau.computeFractionalVolume(true);
            while (fractionalVolume > 0) {
                tableau.applyMIRCuts();
                tableau.simplex();
                const fractionalVolumeAfter = tableau.computeFractionalVolume(true);
                if (fractionalVolumeAfter >= 0.9 * fractionalVolume) {
                    break;
                }
                fractionalVolume = fractionalVolumeAfter;
            }
        }
    };

    const branchAndCut = (tableau: Tableau): void => {
        const branches = new BranchMinHeap();
        let iterations = 0;
        const tolerance = tableau.model?.tolerance ?? 0;
        let toleranceFlag = true;
        const hasTimeout = !!tableau.model?.timeout;
        let terminalTime = 1e99;

        if (hasTimeout) {
            terminalTime = Date.now() + tableau.model.timeout;
        }

        let bestEvaluation = Infinity;
        let bestBranch: Branch | null = null;
        const bestOptionalObjectivesEvaluations: number[] = [];
        // Cache optionalObjectives reference to avoid repeated property lookups in hot loop
        const optionalObjectives = tableau.optionalObjectives;
        const nOptionalObjectives = optionalObjectives.length;
        for (let oInit = 0; oInit < nOptionalObjectives; oInit += 1) {
            bestOptionalObjectivesEvaluations.push(Infinity);
        }

        const branch = createBranch(-Infinity, []);
        let acceptableThreshold: number;

        branches.push(branch);
        while (
            !branches.isEmpty() &&
            toleranceFlag === true &&
            (!hasTimeout || Date.now() < terminalTime)
        ) {
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
            if (activeBranch.relaxedEvaluation >= bestEvaluation) {
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
                for (let o = 0; o < nOptionalObjectives; o += 1) {
                    const currentCost = optionalObjectives[o].reducedCosts[0];
                    const bestCost = bestOptionalObjectivesEvaluations[o];
                    if (currentCost > bestCost) {
                        break;
                    } else if (currentCost < bestCost) {
                        isCurrentEvaluationWorse = false;
                        break;
                    }
                }

                if (isCurrentEvaluationWorse) {
                    continue;
                }
            }

            const variable = tableau.getMostFractionalVar();

            if (variable.index === null) {
                tableau.__isIntegral = true;

                if (iterations === 1) {
                    tableau.branchAndCutIterations = iterations;
                    return;
                }
                bestBranch = activeBranch;
                bestEvaluation = evaluation;
                for (let oCopy = 0; oCopy < nOptionalObjectives; oCopy += 1) {
                    bestOptionalObjectivesEvaluations[oCopy] =
                        optionalObjectives[oCopy].reducedCosts[0];
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

                const varIndex = variable.index as number;
                const varValue = variable.value as number;

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

                const cutHigh = createCut("min", varIndex, Math.ceil(varValue));
                cutsHigh.push(cutHigh);

                const cutLow = createCut("max", varIndex, Math.floor(varValue));
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
