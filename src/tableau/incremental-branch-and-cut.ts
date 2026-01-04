/**
 * @file src/tableau/incremental-branch-and-cut.ts
 * @description Optimized branch-and-cut with incremental state management
 *
 * Key optimization: Instead of always restoring to root and reapplying all cuts,
 * this implementation uses checkpoints to restore to parent state and apply
 * only the new cut. For depth-first traversal, this reduces cut applications
 * from O(depth) to O(1) per node.
 *
 * Memory trade-off: Stores one checkpoint per active path in the B&B tree.
 * For depth D, this is O(D) checkpoints vs O(1) for the basic implementation.
 */
import type Tableau from "./tableau";
import type { Branch, BranchCut } from "./types";
import { BranchMinHeap } from "./min-heap";

export interface IncrementalBranchAndCutService {
    applyCuts(tableau: Tableau, branchingCuts: BranchCut[]): void;
    branchAndCut(tableau: Tableau): void;
}

export interface IncrementalBranchAndCutOptions {
    nodeSelection?: "best-first" | "depth-first" | "hybrid";
    branching?: "most-fractional" | "pseudocost";
    maxCheckpoints?: number; // Limit memory usage
}

/**
 * Lightweight checkpoint storing only what's needed for restoration
 */
interface StateCheckpoint {
    matrix: Float64Array;
    width: number;
    height: number;
    nVars: number;
    varIndexByRow: number[];
    varIndexByCol: number[];
    rowByVarIndex: number[];
    colByVarIndex: number[];
    availableIndexes: number[];
    lastElementIndex: number;
    evaluation: number;
    feasible: boolean;
}

/**
 * Extended branch with parent reference for incremental restoration
 */
interface IncrementalBranch extends Branch {
    depth: number;
    parentCheckpoint?: StateCheckpoint;
    newCut?: BranchCut; // The single cut added from parent
}

function createCheckpoint(tableau: Tableau): StateCheckpoint {
    return {
        matrix: new Float64Array(tableau.matrix),
        width: tableau.width,
        height: tableau.height,
        nVars: tableau.nVars,
        varIndexByRow: tableau.varIndexByRow.slice(),
        varIndexByCol: tableau.varIndexByCol.slice(),
        rowByVarIndex: tableau.rowByVarIndex.slice(),
        colByVarIndex: tableau.colByVarIndex.slice(),
        availableIndexes: tableau.availableIndexes.slice(),
        lastElementIndex: tableau.lastElementIndex,
        evaluation: tableau.evaluation,
        feasible: tableau.feasible,
    };
}

function restoreCheckpoint(tableau: Tableau, checkpoint: StateCheckpoint): void {
    // Only copy if sizes match, otherwise need full restore
    if (tableau.matrix.length >= checkpoint.matrix.length) {
        tableau.matrix.set(checkpoint.matrix);
    } else {
        tableau.matrix = new Float64Array(checkpoint.matrix);
    }

    tableau.width = checkpoint.width;
    tableau.height = checkpoint.height;
    tableau.nVars = checkpoint.nVars;

    // Restore arrays
    const height = checkpoint.height;
    for (let i = 0; i < height; i++) {
        tableau.varIndexByRow[i] = checkpoint.varIndexByRow[i];
    }
    tableau.varIndexByRow.length = height;

    const width = checkpoint.width;
    for (let i = 0; i < width; i++) {
        tableau.varIndexByCol[i] = checkpoint.varIndexByCol[i];
    }
    tableau.varIndexByCol.length = width;

    const nVars = checkpoint.nVars;
    for (let i = 0; i < nVars; i++) {
        tableau.rowByVarIndex[i] = checkpoint.rowByVarIndex[i];
        tableau.colByVarIndex[i] = checkpoint.colByVarIndex[i];
    }

    tableau.availableIndexes = checkpoint.availableIndexes.slice();
    tableau.lastElementIndex = checkpoint.lastElementIndex;
    tableau.evaluation = checkpoint.evaluation;
    tableau.feasible = checkpoint.feasible;
}

function createCut(type: BranchCut["type"], varIndex: number, value: number): BranchCut {
    return { type, varIndex, value };
}

function createBranch(
    relaxedEvaluation: number,
    cuts: BranchCut[],
    depth: number,
    parentCheckpoint?: StateCheckpoint,
    newCut?: BranchCut
): IncrementalBranch {
    return { relaxedEvaluation, cuts, depth, parentCheckpoint, newCut };
}

interface PseudoCostData {
    upSum: number;
    upCount: number;
    downSum: number;
    downCount: number;
}

export function createIncrementalBranchAndCutService(
    options: IncrementalBranchAndCutOptions = {}
): IncrementalBranchAndCutService {
    const {
        nodeSelection = "hybrid",
        branching = "pseudocost",
        maxCheckpoints = 50, // Limit checkpoints to avoid memory overhead
    } = options;

    const pseudoCosts = new Map<number, PseudoCostData>();

    const getPseudoCost = (varIndex: number): PseudoCostData => {
        let data = pseudoCosts.get(varIndex);
        if (!data) {
            data = { upSum: 0, upCount: 0, downSum: 0, downCount: 0 };
            pseudoCosts.set(varIndex, data);
        }
        return data;
    };

    const updatePseudoCost = (
        varIndex: number,
        direction: "up" | "down",
        improvement: number,
        fraction: number
    ): void => {
        const data = getPseudoCost(varIndex);
        const normalizedImprovement = improvement / (direction === "up" ? 1 - fraction : fraction);

        if (direction === "up") {
            data.upSum += normalizedImprovement;
            data.upCount++;
        } else {
            data.downSum += normalizedImprovement;
            data.downCount++;
        }
    };

    const getScore = (varIndex: number, fraction: number): number => {
        const data = getPseudoCost(varIndex);
        const upPseudo = data.upCount > 0 ? data.upSum / data.upCount : 1;
        const downPseudo = data.downCount > 0 ? data.downSum / data.downCount : 1;
        const upEstimate = upPseudo * (1 - fraction);
        const downEstimate = downPseudo * fraction;
        return Math.max(upEstimate, 1e-6) * Math.max(downEstimate, 1e-6);
    };

    const selectBranchingVariable = (
        tableau: Tableau
    ): { index: number; value: number; fraction: number } | null => {
        const width = tableau.width;
        const matrix = tableau.matrix;
        const rhsColumn = tableau.rhsColumn;
        const integerVars = tableau.model!.integerVariables;
        const precision = tableau.precision;

        const candidates: Array<{ index: number; value: number; fraction: number }> = [];

        for (const variable of integerVars) {
            const varIndex = variable.index;
            const row = tableau.rowByVarIndex[varIndex];
            if (row !== -1) {
                const value = matrix[row * width + rhsColumn];
                const fraction = Math.abs(value - Math.round(value));
                if (fraction > precision) {
                    candidates.push({ index: varIndex, value, fraction });
                }
            }
        }

        if (candidates.length === 0) return null;

        if (branching === "most-fractional") {
            candidates.sort((a, b) => b.fraction - a.fraction);
            return candidates[0];
        }

        // Pseudocost branching
        let bestScore = -Infinity;
        let bestCandidate = candidates[0];

        for (const candidate of candidates) {
            const score = getScore(candidate.index, candidate.fraction);
            if (score > bestScore) {
                bestScore = score;
                bestCandidate = candidate;
            }
        }

        return bestCandidate;
    };

    // Standard applyCuts - restores to root and applies all cuts
    const applyCuts = (tableau: Tableau, branchingCuts: BranchCut[]): void => {
        tableau.restore();
        tableau.addCutConstraints(branchingCuts);
        tableau.simplex();

        if (tableau.model?.useMIRCuts && tableau.feasible) {
            let fractionalVolumeImproved = true;
            let mirIterations = 0;
            const maxMIRIterations = 3;

            while (fractionalVolumeImproved && mirIterations < maxMIRIterations) {
                const fractionalVolumeBefore = tableau.computeFractionalVolume(true);
                tableau.applyMIRCuts();
                tableau.simplex();
                const fractionalVolumeAfter = tableau.computeFractionalVolume(true);
                mirIterations++;

                if (fractionalVolumeAfter >= 0.9 * fractionalVolumeBefore) {
                    fractionalVolumeImproved = false;
                }
            }
        }
    };

    // Incremental applyCuts - uses parent checkpoint if available
    const applyIncrementalCuts = (tableau: Tableau, branch: IncrementalBranch): void => {
        if (branch.parentCheckpoint && branch.newCut) {
            // Fast path: restore parent and apply only new cut
            restoreCheckpoint(tableau, branch.parentCheckpoint);
            tableau.addCutConstraints([branch.newCut]);
            tableau.simplex();
        } else {
            // Fallback: full restore from root
            tableau.restore();
            tableau.addCutConstraints(branch.cuts);
            tableau.simplex();
        }

        if (tableau.model?.useMIRCuts && tableau.feasible) {
            let fractionalVolumeImproved = true;
            let mirIterations = 0;
            const maxMIRIterations = 3;

            while (fractionalVolumeImproved && mirIterations < maxMIRIterations) {
                const fractionalVolumeBefore = tableau.computeFractionalVolume(true);
                tableau.applyMIRCuts();
                tableau.simplex();
                const fractionalVolumeAfter = tableau.computeFractionalVolume(true);
                mirIterations++;

                if (fractionalVolumeAfter >= 0.9 * fractionalVolumeBefore) {
                    fractionalVolumeImproved = false;
                }
            }
        }
    };

    const branchAndCut = (tableau: Tableau): void => {
        const branches = new BranchMinHeap();
        const depthFirstStack: IncrementalBranch[] = [];

        let iterations = 0;
        let checkpointCount = 0;
        const tolerance = tableau.model?.tolerance ?? 0;
        let toleranceFlag = true;
        let terminalTime = 1e99;

        if (tableau.model?.timeout) {
            terminalTime = Date.now() + tableau.model.timeout;
        }

        let bestEvaluation = Infinity;
        let bestBranch: IncrementalBranch | null = null;
        const bestOptionalObjectivesEvaluations: number[] = [];
        for (let oInit = 0; oInit < tableau.optionalObjectives.length; oInit++) {
            bestOptionalObjectivesEvaluations.push(Infinity);
        }

        const switchToBestFirstAfterSolutions = 1;
        let solutionsFound = 0;
        let useDepthFirst = nodeSelection === "depth-first" || nodeSelection === "hybrid";

        const rootBranch = createBranch(-Infinity, [], 0);

        if (useDepthFirst) {
            depthFirstStack.push(rootBranch);
        } else {
            branches.push(rootBranch);
        }

        while (
            (useDepthFirst ? depthFirstStack.length > 0 : !branches.isEmpty()) &&
            toleranceFlag === true &&
            Date.now() < terminalTime
        ) {
            let acceptableThreshold: number;
            if (tableau.model?.isMinimization) {
                acceptableThreshold = tableau.bestPossibleEval * (1 + tolerance);
            } else {
                acceptableThreshold = tableau.bestPossibleEval * (1 - tolerance);
            }

            if (tolerance > 0 && bestEvaluation < acceptableThreshold) {
                toleranceFlag = false;
            }

            let activeBranch: IncrementalBranch;
            if (useDepthFirst && depthFirstStack.length > 0) {
                activeBranch = depthFirstStack.pop()!;
            } else if (!branches.isEmpty()) {
                activeBranch = branches.pop() as IncrementalBranch;
            } else {
                break;
            }

            if (activeBranch.relaxedEvaluation > bestEvaluation) {
                continue;
            }

            const parentEval = tableau.evaluation;

            // Use incremental restoration if available
            applyIncrementalCuts(tableau, activeBranch);
            iterations++;

            if (!tableau.feasible) {
                continue;
            }

            const evaluation = tableau.evaluation;
            if (evaluation > bestEvaluation) {
                continue;
            }

            // Update pseudocosts
            if (activeBranch.newCut && parentEval !== 0) {
                const improvement = Math.abs(evaluation - parentEval);
                const fraction = 0.5;
                updatePseudoCost(
                    activeBranch.newCut.varIndex,
                    activeBranch.newCut.type === "min" ? "up" : "down",
                    improvement,
                    fraction
                );
            }

            if (evaluation === bestEvaluation) {
                let isCurrentEvaluationWorse = true;
                for (let o = 0; o < tableau.optionalObjectives.length; o++) {
                    if (
                        tableau.optionalObjectives[o].reducedCosts[0] >
                        bestOptionalObjectivesEvaluations[o]
                    ) {
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

            if (tableau.isIntegral()) {
                tableau.__isIntegral = true;
                solutionsFound++;

                if (iterations === 1) {
                    tableau.branchAndCutIterations = iterations;
                    return;
                }

                bestBranch = activeBranch;
                bestEvaluation = evaluation;

                for (let oCopy = 0; oCopy < tableau.optionalObjectives.length; oCopy++) {
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

                // Switch to best-first after finding solutions
                if (
                    nodeSelection === "hybrid" &&
                    solutionsFound >= switchToBestFirstAfterSolutions
                ) {
                    useDepthFirst = false;
                    while (depthFirstStack.length > 0) {
                        branches.push(depthFirstStack.pop()!);
                    }
                }
            } else {
                if (iterations === 1) {
                    tableau.save();
                }

                const variable = selectBranchingVariable(tableau);
                if (!variable) continue;

                const varIndex = variable.index;
                const varValue = variable.value;

                // Create checkpoint for children (only if under limit)
                let checkpoint: StateCheckpoint | undefined;
                if (useDepthFirst && checkpointCount < maxCheckpoints) {
                    checkpoint = createCheckpoint(tableau);
                    checkpointCount++;
                }

                const cutsHigh: BranchCut[] = [];
                const cutsLow: BranchCut[] = [];

                const nCuts = activeBranch.cuts.length;
                for (let c = 0; c < nCuts; c++) {
                    const cut = activeBranch.cuts[c];
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

                const min = Math.ceil(varValue);
                const max = Math.floor(varValue);

                const cutHigh = createCut("min", varIndex, min);
                cutsHigh.push(cutHigh);

                const cutLow = createCut("max", varIndex, max);
                cutsLow.push(cutLow);

                const newDepth = activeBranch.depth + 1;

                if (useDepthFirst) {
                    // Push with parent checkpoint for incremental restoration
                    depthFirstStack.push(
                        createBranch(evaluation, cutsLow, newDepth, checkpoint, cutLow)
                    );
                    depthFirstStack.push(
                        createBranch(evaluation, cutsHigh, newDepth, checkpoint, cutHigh)
                    );
                } else {
                    // Best-first doesn't use checkpoints (would need too much memory)
                    branches.push(createBranch(evaluation, cutsHigh, newDepth));
                    branches.push(createBranch(evaluation, cutsLow, newDepth));
                }
            }
        }

        if (bestBranch !== null) {
            applyCuts(tableau, bestBranch.cuts);
        }
        tableau.branchAndCutIterations = iterations;
    };

    return { applyCuts, branchAndCut };
}
