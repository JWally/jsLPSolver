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
    const applyMIRCuts = (tableau: Tableau): void => {
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

    const applyCuts = (tableau: Tableau, branchingCuts: BranchCut[]): void => {
        tableau.restore();

        tableau.addCutConstraints(branchingCuts);
        tableau.simplex();
        applyMIRCuts(tableau);
    };

    // Plunging: solve one child directly from its parent's optimal tableau by
    // adding only the new bound row. The parent basis stays dual feasible, so
    // phase 1 runs as a dual simplex and usually needs a pivot or two, instead
    // of restoring the root and re-solving every bound on the path.
    const applyCutInPlace = (tableau: Tableau, cut: BranchCut): void => {
        tableau.addCutConstraints([cut]);
        tableau.simplex();
        applyMIRCuts(tableau);
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

        // Objective integrality: if every variable with a nonzero objective
        // coefficient is integer and every such coefficient is integral, any
        // integer-feasible objective value is integral, so a node whose LP
        // bound rounds up to the incumbent cannot improve on it.
        let objectiveIsIntegral = nOptionalObjectives === 0;
        const modelVariables = tableau.model?.variables ?? [];
        for (let v = 0; objectiveIsIntegral && v < modelVariables.length; v++) {
            const variable = modelVariables[v];
            if (variable.cost !== 0 && (!variable.isInteger || !Number.isInteger(variable.cost))) {
                objectiveIsIntegral = false;
            }
        }
        const cannotImprove = (bound: number): boolean =>
            objectiveIsIntegral
                ? Math.ceil(bound - 1e-6) >= bestEvaluation
                : bound >= bestEvaluation;

        const branch = createBranch(-Infinity, []);
        let acceptableThreshold: number;

        branches.push(branch);

        // Child to solve next in place (see applyCutInPlace), with its new cut.
        let diveBranch: Branch | null = null;
        let diveCut: BranchCut | null = null;

        // Queued siblings keep a snapshot of their parent's optimal tableau so
        // they resume with one added row instead of re-solving from the root.
        // Optional objectives carry extra pivoted state, so they opt out.
        const SNAPSHOT_BUDGET_BYTES = 256 * 1024 * 1024;
        const useSnapshots = nOptionalObjectives === 0;

        // Whether a snapshot pays off depends on how pivot cost compares with
        // a matrix copy, which varies with size and sparsity. Measure both
        // routes as we go: average cost per path row when re-solving from the
        // root, and the full cost of the snapshot route (copy, load, in-place
        // solve). Snapshot a sibling only when re-solving its path is expected
        // to cost more. Until both are measured, alternate to sample each.
        const now = typeof performance !== "undefined" ? () => performance.now() : () => Date.now();
        const EMA_WEIGHT = 0.1;
        let restoreMsPerCut = -1;
        let snapshotRouteMs = -1;
        let explorationToggle = false;
        const ema = (avg: number, sample: number): number =>
            avg < 0 ? sample : avg + EMA_WEIGHT * (sample - avg);
        const shouldSnapshot = (depth: number): boolean => {
            if (restoreMsPerCut < 0 || snapshotRouteMs < 0) {
                explorationToggle = !explorationToggle;
                return explorationToggle;
            }
            return restoreMsPerCut * depth > snapshotRouteMs;
        };
        let snapshotBytes = 0;

        // Node selection: plunge, then backtrack to the most recent sibling
        // (cheap, since its parent snapshot is fresh), and every
        // BEST_BOUND_EVERY selections jump to the best-bound node so the
        // global bound keeps moving. Pure depth-first is fast on some
        // instances but stalls badly on others (MIPLIB bell3a); pure
        // best-first loses the warm start. Siblings live in both the heap
        // and this stack; `done` marks the copy already processed.
        const BEST_BOUND_EVERY = 100;
        const recentSiblings: Branch[] = [];
        let selections = 0;
        const nextFromHeap = (): Branch | undefined => {
            let b = branches.pop();
            while (b !== undefined && b.done) b = branches.pop();
            return b;
        };
        const selectNode = (): Branch | undefined => {
            selections++;
            if (selections % BEST_BOUND_EVERY !== 0) {
                while (recentSiblings.length > 0) {
                    const candidate = recentSiblings.pop()!;
                    if (!candidate.done) return candidate;
                }
            }
            return nextFromHeap();
        };

        while (
            (diveBranch !== null || !branches.isEmpty() || recentSiblings.length > 0) &&
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

            let activeBranch: Branch;
            if (diveBranch !== null) {
                activeBranch = diveBranch;
                applyCutInPlace(tableau, diveCut!);
                diveBranch = null;
                diveCut = null;
            } else {
                const selected = selectNode();
                if (selected === undefined) break;
                activeBranch = selected;
                activeBranch.done = true;
                const parentSnapshot = activeBranch.parentSnapshot;
                if (parentSnapshot) {
                    snapshotBytes -= parentSnapshot.matrix.byteLength;
                    activeBranch.parentSnapshot = null;
                }
                if (cannotImprove(activeBranch.relaxedEvaluation)) {
                    continue;
                }
                const startedAt = now();
                if (parentSnapshot) {
                    tableau.loadSnapshot(parentSnapshot);
                    applyCutInPlace(tableau, activeBranch.lastCut!);
                    snapshotRouteMs = ema(
                        snapshotRouteMs,
                        now() - startedAt + (activeBranch.snapshotMs ?? 0)
                    );
                } else {
                    applyCuts(tableau, activeBranch.cuts);
                    if (activeBranch.cuts.length > 0) {
                        restoreMsPerCut = ema(
                            restoreMsPerCut,
                            (now() - startedAt) / activeBranch.cuts.length
                        );
                    }
                }
            }

            const cuts = activeBranch.cuts;

            iterations++;
            if (tableau.feasible === false) {
                continue;
            }

            const evaluation = tableau.evaluation;
            if (evaluation > bestEvaluation) {
                continue;
            }
            if (objectiveIsIntegral && cannotImprove(evaluation)) {
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

            if (tableau.isIntegral() === true) {
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

                const variable = tableau.getMostFractionalVar();

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

                const branchHigh = createBranch(evaluation, cutsHigh);
                branchHigh.lastCut = cutHigh;
                const branchLow = createBranch(evaluation, cutsLow);
                branchLow.lastCut = cutLow;

                // Dive toward the nearer integer; queue the sibling.
                let sibling: Branch;
                if (varValue - Math.floor(varValue) >= 0.5) {
                    diveBranch = branchHigh;
                    diveCut = cutHigh;
                    sibling = branchLow;
                } else {
                    diveBranch = branchLow;
                    diveCut = cutLow;
                    sibling = branchHigh;
                }
                if (
                    useSnapshots &&
                    snapshotBytes < SNAPSHOT_BUDGET_BYTES &&
                    shouldSnapshot(sibling.cuts.length)
                ) {
                    const snapshotStartedAt = now();
                    const parentSnapshot = tableau.snapshot();
                    sibling.snapshotMs = now() - snapshotStartedAt;
                    snapshotBytes += parentSnapshot.matrix.byteLength;
                    sibling.parentSnapshot = parentSnapshot;
                }
                branches.push(sibling);
                recentSiblings.push(sibling);
            }
        }

        if (bestBranch !== null) {
            applyCuts(tableau, bestBranch.cuts);
        }
        tableau.branchAndCutIterations = iterations;
    };

    return { applyCuts, branchAndCut };
}
