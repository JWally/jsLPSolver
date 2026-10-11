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
import type { NodeSnapshot } from "./backup";
import { BranchMinHeap } from "./min-heap";
import { lowerBoundOf, rangeOf, setVariableBounds, toActual, upperBoundOf } from "./bounds";
import { Pseudocosts, RELIABILITY, productScore } from "./pseudocosts";
import { addGomoryCuts, removeSlackCuts } from "./gomory";
import { presolveRootTableau } from "./root-presolve";

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

    // Branching bounds become column bounds (bounds.ts) instead of added
    // rows: the tableau keeps its size at every depth and the parent basis
    // stays dual feasible. MIR cuts read raw tableau rows and optional
    // objectives carry extra pivoted state, so those keep the row path.
    const usesBoundBranching = (tableau: Tableau): boolean => {
        const model = tableau.model;
        if (!model || model.useMIRCuts || tableau.optionalObjectives.length > 0) return false;
        const integerVariables = model.integerVariables;
        for (let i = 0; i < integerVariables.length; i++) {
            if (tableau.unrestrictedVars[integerVariables[i].index] === true) return false;
        }
        return true;
    };

    /** Tighten one variable bound; false if the bounds became empty. */
    const tightenBound = (tableau: Tableau, cut: BranchCut): boolean => {
        let lb = lowerBoundOf(tableau, cut.varIndex);
        let ub = upperBoundOf(tableau, cut.varIndex);
        if (cut.type === "min") {
            lb = Math.max(lb, cut.value);
        } else {
            ub = Math.min(ub, cut.value);
        }
        return setVariableBounds(tableau, cut.varIndex, lb, ub);
    };

    const solveNode = (tableau: Tableau, boundsOk: boolean): void => {
        if (!boundsOk) {
            tableau.feasible = false;
            return;
        }
        tableau.simplex();
        applyMIRCuts(tableau);
    };

    const applyCuts = (tableau: Tableau, branchingCuts: BranchCut[]): void => {
        tableau.restore();

        if (usesBoundBranching(tableau)) {
            let boundsOk = true;
            for (let c = 0; boundsOk && c < branchingCuts.length; c++) {
                boundsOk = tightenBound(tableau, branchingCuts[c]);
            }
            solveNode(tableau, boundsOk);
            return;
        }
        tableau.addCutConstraints(branchingCuts);
        solveNode(tableau, true);
    };

    // Plunging: solve one child directly from its parent's optimal tableau by
    // adding only the new bound row. The parent basis stays dual feasible, so
    // phase 1 runs as a dual simplex and usually needs a pivot or two, instead
    // of restoring the root and re-solving every bound on the path.
    const applyCutInPlace = (tableau: Tableau, cut: BranchCut): void => {
        if (usesBoundBranching(tableau)) {
            solveNode(tableau, tightenBound(tableau, cut));
            return;
        }
        tableau.addCutConstraints([cut]);
        solveNode(tableau, true);
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
        // On the column-bounds path the incumbent's tableau is kept as a
        // snapshot: re-solving its node from the root by its branching bounds
        // would miss reduced-cost fixings and could return a fractional
        // vertex of the same LP. The rows path re-solves as before.
        let bestBranch: Branch | null = null;
        let bestSnapshot: NodeSnapshot | null = null;
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
        // bound rounds up to the incumbent cannot improve on it. Rounding is
        // to multiples of the coefficients' GCD (e.g. all costs multiples of 5).
        let objectiveIsIntegral = nOptionalObjectives === 0;
        let objectiveStep = 0;
        const gcd = (a: number, b: number): number => {
            while (b !== 0) {
                const t = a % b;
                a = b;
                b = t;
            }
            return a;
        };
        const modelVariables = tableau.model?.variables ?? [];
        for (let v = 0; objectiveIsIntegral && v < modelVariables.length; v++) {
            const variable = modelVariables[v];
            if (variable.cost === 0) continue;
            const integral =
                variable.isInteger || tableau.model?.integralContinuous?.has(variable.id) === true;
            if (!integral || !Number.isInteger(variable.cost)) {
                objectiveIsIntegral = false;
            } else {
                objectiveStep = gcd(objectiveStep, Math.abs(variable.cost));
            }
        }
        if (objectiveStep === 0) objectiveIsIntegral = false;
        const cannotImprove = (bound: number): boolean => {
            if (!objectiveIsIntegral) return bound >= bestEvaluation;
            // Subtracting a tolerance only makes the rounding more conservative.
            const slack = 1e-6 * Math.max(1, Math.abs(bound));
            return Math.ceil((bound - slack) / objectiveStep) * objectiveStep >= bestEvaluation;
        };

        // Root presolve on the fresh tableau (bound propagation and big-M
        // coefficient tightening); only on the column-bounds path, before the
        // first pivot.
        if (usesBoundBranching(tableau) && tableau.pivotCount === 0) {
            if (!presolveRootTableau(tableau).feasible) {
                tableau.feasible = false;
                tableau.branchAndCutIterations = 0;
                return;
            }
        }

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
        // a matrix copy, which varies with size and sparsity. Estimate both
        // routes as we go, in deterministic work units (never the clock, so
        // the tree does not depend on machine speed): a pivot costs one unit
        // per tableau cell, a copy COPY_COST per cell. Track the average cost
        // per path row when re-solving from the root, and the full cost of the
        // snapshot route (copy, load, in-place solve). Snapshot a sibling only
        // when re-solving its path is expected to cost more. Until both are
        // measured, snapshot (see shouldSnapshot).
        const COPY_COST = 0.1;
        const EMA_WEIGHT = 0.1;
        let restoreWorkPerCut = -1;
        let snapshotRouteWork = -1;
        const ema = (avg: number, sample: number): number =>
            avg < 0 ? sample : avg + EMA_WEIGHT * (sample - avg);
        const shouldSnapshot = (depth: number): boolean => {
            // Until both routes are measured, snapshot: a copy costs about
            // 0.2 pivots' worth of work, while a restore re-solves every bound
            // on the path. Sampling restores first cost Vendor Selection
            // (1692x1641) ~600 pivots for nothing.
            if (restoreWorkPerCut < 0 || snapshotRouteWork < 0) return true;
            return restoreWorkPerCut * depth > snapshotRouteWork;
        };
        let snapshotBytes = 0;
        // Consumed or discarded snapshots are recycled: on small tableaus
        // allocating one per queued sibling made garbage collection ~9% of
        // the run (MIPLIB mas76, ~300k nodes).
        const snapshotPool: NodeSnapshot[] = [];
        const SNAPSHOT_POOL_SIZE = 32;
        const takeSnapshot = (): NodeSnapshot => tableau.snapshot(snapshotPool.pop() ?? null);
        const releaseSnapshot = (snap: NodeSnapshot): void => {
            if (snapshotPool.length < SNAPSHOT_POOL_SIZE) snapshotPool.push(snap);
        };

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

        // Branching-variable selection: reliability branching (Achterberg,
        // Koch and Martin 2005). Score fractional candidates by pseudocosts;
        // a candidate whose pseudocosts rest on fewer than RELIABILITY
        // observations is strong branched instead: both children are solved
        // from a snapshot of this node, and the measured gains score it and
        // seed its pseudocosts. Strong branching stops after LOOKAHEAD
        // candidates in a row fail to beat the best, and its pivots are
        // capped relative to the search's (deterministic work, no clock).
        // The rows path (MIR cuts, optional objectives) keeps the
        // most-fractional rule.
        const pseudocosts = new Pseudocosts(tableau.nVars);
        const strongBranching = usesBoundBranching(tableau);
        const LOOKAHEAD = 4;
        const MAX_STRONG_CANDIDATES = 10;
        let strongPivots = 0;
        const candidateIndex: number[] = [];
        const candidateValue: number[] = [];
        const candidateFraction: number[] = [];
        const candidateScore: number[] = [];
        const candidateOrder: number[] = [];

        // Strong-branching child LPs stop after STRONG_PIVOT_FACTOR times the
        // average in-place node solve, at least STRONG_MIN_PIVOTS (SCIP limits
        // them similarly): from the node's dual-feasible basis the objective
        // reached is still a valid bound. Tighter caps lose infeasibility
        // proofs (MIPLIB enigma: 10x the nodes at 2x/10); no cap leaves
        // mod010-size tableaus spending most pivots in strong branching.
        // 4x/50 had the best shifted geometric mean over MIPLIB 3.
        const STRONG_PIVOT_FACTOR = 4;
        const STRONG_WORK_ALLOWANCE = 2e8;
        const STRONG_MIN_PIVOTS = 50;
        let nodePivotAverage = -1;
        const strongBranchGain = (cut: BranchCut, nodeEvaluation: number): number => {
            const pivotsBefore = tableau.pivotCount;
            tableau.dualIterationLimit =
                nodePivotAverage < 0
                    ? 0
                    : Math.max(
                          STRONG_MIN_PIVOTS,
                          Math.ceil(STRONG_PIVOT_FACTOR * nodePivotAverage)
                      );
            applyCutInPlace(tableau, cut);
            tableau.dualIterationLimit = 0;
            strongPivots += tableau.pivotCount - pivotsBefore;
            return tableau.feasible ? tableau.evaluation - nodeEvaluation : Infinity;
        };

        // Children strong branching proved infeasible for the chosen variable.
        let chosenDownInfeasible = false;
        let chosenUpInfeasible = false;
        const selectBranchVariable = (
            nodeEvaluation: number
        ): { varIndex: number; value: number } | null => {
            chosenDownInfeasible = false;
            chosenUpInfeasible = false;
            if (!strongBranching) {
                const variable = tableau.getMostFractionalVar();
                return { varIndex: variable.index as number, value: variable.value as number };
            }
            const integerVariables = tableau.model.integerVariables;
            const matrix = tableau.matrix;
            const width = tableau.width;
            const rowByVarIndex = tableau.rowByVarIndex;
            const precision = tableau.precision;
            candidateIndex.length = 0;
            candidateValue.length = 0;
            candidateFraction.length = 0;
            for (let v = 0; v < integerVariables.length; v++) {
                const varIndex = integerVariables[v].index;
                const row = rowByVarIndex[varIndex];
                if (row === -1) continue;
                const value = toActual(tableau, varIndex, matrix[row * width]);
                const f = value - Math.floor(value);
                if (f <= precision || f >= 1 - precision) continue;
                candidateIndex.push(varIndex);
                candidateValue.push(value);
                candidateFraction.push(f);
            }
            const n = candidateIndex.length;
            let best = 0;
            let bestScore = -Infinity;
            candidateScore.length = n;
            candidateOrder.length = 0;
            for (let i = 0; i < n; i++) {
                candidateScore[i] = pseudocosts.score(candidateIndex[i], candidateFraction[i]);
                if (pseudocosts.reliability(candidateIndex[i]) < RELIABILITY) {
                    candidateOrder.push(i);
                } else if (candidateScore[i] > bestScore) {
                    bestScore = candidateScore[i];
                    best = i;
                }
            }
            // Strong branching may use half the pivots of the rest of the
            // search plus a fixed allowance of work (pivots x cells), so a
            // large dense tableau gets proportionally fewer free pivots:
            // a flat 1000 cost seconds on Vendor Selection (1691x1641).
            const strongBudget =
                0.5 * (tableau.pivotCount - strongPivots) +
                STRONG_WORK_ALLOWANCE / (tableau.height * tableau.width);
            if (n > 1 && candidateOrder.length > 0 && strongPivots < strongBudget) {
                // Most promising unreliable candidates first.
                candidateOrder.sort((i, j) => candidateScore[j] - candidateScore[i] || i - j);
                const nodeSnapshot = takeSnapshot();
                let sinceImprovement = 0;
                let tried = 0;
                for (let k = 0; k < candidateOrder.length; k++) {
                    if (tried >= MAX_STRONG_CANDIDATES || sinceImprovement >= LOOKAHEAD) break;
                    if (strongPivots >= strongBudget) break;
                    const i = candidateOrder[k];
                    const varIndex = candidateIndex[i];
                    const value = candidateValue[i];
                    const f = candidateFraction[i];
                    tried++;
                    const downGain = strongBranchGain(
                        createCut("max", varIndex, Math.floor(value)),
                        nodeEvaluation
                    );
                    tableau.loadSnapshot(nodeSnapshot);
                    const upGain = strongBranchGain(
                        createCut("min", varIndex, Math.ceil(value)),
                        nodeEvaluation
                    );
                    tableau.loadSnapshot(nodeSnapshot);
                    pseudocosts.record(varIndex, false, f, downGain);
                    pseudocosts.record(varIndex, true, 1 - f, upGain);
                    if (downGain === Infinity && upGain === Infinity) {
                        releaseSnapshot(nodeSnapshot);
                        return null;
                    }
                    const score = productScore(downGain, upGain);
                    if (score > bestScore) {
                        bestScore = score;
                        best = i;
                        chosenDownInfeasible = downGain === Infinity;
                        chosenUpInfeasible = upGain === Infinity;
                        sinceImprovement = 0;
                    } else {
                        sinceImprovement++;
                    }
                }
                releaseSnapshot(nodeSnapshot);
                tableau.feasible = true;
                tableau.evaluation = nodeEvaluation;
            } else {
                for (let k = 0; k < candidateOrder.length; k++) {
                    const i = candidateOrder[k];
                    if (candidateScore[i] > bestScore) {
                        bestScore = candidateScore[i];
                        best = i;
                    }
                }
            }
            return { varIndex: candidateIndex[best], value: candidateValue[best] };
        };

        // Reduced-cost fixing: at an optimal node LP every nonbasic column c
        // has reduced cost d_c <= 0, and raising its stored variable s_c by t
        // raises the node bound by at least |d_c| t. Once an incumbent
        // exists, any s_c whose move by k units already cannot improve on it
        // is limited to k - 1 for this subtree. Nonbasic variables sit at
        // s = 0, so only their range changes (no tableau update), and the LP
        // stays optimal. Dives and snapshot-resumed siblings inherit the
        // fixings; nodes re-solved from the root do not, which is weaker but
        // still valid.
        const fixByReducedCost = (nodeEvaluation: number): void => {
            const matrix = tableau.matrix;
            const lastColumn = tableau.width - 1;
            const precision = tableau.precision;
            for (let c = 1; c <= lastColumn; c++) {
                const d = matrix[c];
                if (d >= -precision) continue;
                const v = tableau.varIndexByCol[c];
                const variable = tableau.variablesPerIndex[v];
                if (variable?.isInteger !== true || tableau.unrestrictedVars[v] === true) continue;
                // The stored variable is integral only with an integer offset.
                if (!Number.isInteger(tableau.boundOffset[v])) continue;
                const range = rangeOf(tableau, v);
                if (range <= precision) continue;
                // Largest integer move k that might still improve.
                let keep = 0;
                const limit = Math.min(range, 1e9);
                while (keep + 1 <= limit && !cannotImprove(nodeEvaluation - d * (keep + 1))) {
                    keep++;
                    if (keep > 64) {
                        keep = limit;
                        break;
                    }
                }
                if (keep >= range) continue;
                const offset = tableau.boundOffset[v];
                if (tableau.boundSign[v] === 1) {
                    setVariableBounds(tableau, v, lowerBoundOf(tableau, v), offset + keep);
                } else {
                    setVariableBounds(tableau, v, offset - keep, upperBoundOf(tableau, v));
                }
            }
        };

        // Root cutting planes: up to ROOT_CUT_ROUNDS rounds of Gomory
        // mixed-integer cuts from the optimal root tableau, re-optimized by
        // dual simplex, until the bound stops moving; then cuts that ended
        // up slack are deleted. They are added before the root is saved, so
        // every node inherits them. Total cuts are capped at the original
        // row count. More rounds tighten further but enlarge every node's
        // tableau; 3 had the best shifted geometric mean over MIPLIB 3
        // (10 rounds lost gt2 entirely).
        const ROOT_CUT_ROUNDS = 3;
        const ROOT_CUT_MIN_GAIN = 1e-4;
        const addRootCuts = (): void => {
            const firstCutRow = tableau.height;
            const cutBudget = tableau.height - 1;
            const rootEvaluation = tableau.evaluation;
            const beforeCuts = takeSnapshot();
            let total = 0;
            for (let round = 0; round < ROOT_CUT_ROUNDS && total < cutBudget; round++) {
                const before = tableau.evaluation;
                const perRound = Math.min(cutBudget - total, Math.max(10, cutBudget >> 2));
                const added = addGomoryCuts(tableau, perRound);
                if (added === 0) break;
                total += added;
                tableau.simplex();
                if (!tableau.feasible) {
                    releaseSnapshot(beforeCuts);
                    return;
                }
                const gain = tableau.evaluation - before;
                if (gain < ROOT_CUT_MIN_GAIN * Math.max(1, Math.abs(tableau.evaluation))) break;
            }
            // Cut rows are dense and make every later pivot costlier. With an
            // integral objective, cuts that leave the rounded bound where it
            // was cannot prune anything the root bound could not, so they are
            // dropped (Vendor Selection: 1482.33 -> 1482.79, both round to
            // 1483). A small relative gain alone is no reason to drop them:
            // on Monster II it is what closes the problem at the root.
            const roundedUp = (bound: number): number => {
                const slack = 1e-6 * Math.max(1, Math.abs(bound));
                return Math.ceil((bound - slack) / objectiveStep) * objectiveStep;
            };
            if (objectiveIsIntegral && roundedUp(tableau.evaluation) <= roundedUp(rootEvaluation)) {
                tableau.loadSnapshot(beforeCuts);
                tableau.feasible = true;
                tableau.evaluation = rootEvaluation;
            } else {
                removeSlackCuts(tableau, firstCutRow);
            }
            releaseSnapshot(beforeCuts);
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
                const pivotsBefore = tableau.pivotCount;
                applyCutInPlace(tableau, diveCut!);
                nodePivotAverage = ema(nodePivotAverage, tableau.pivotCount - pivotsBefore);
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
                    if (parentSnapshot) releaseSnapshot(parentSnapshot);
                    continue;
                }
                const pivotsBefore = tableau.pivotCount;
                if (parentSnapshot) {
                    tableau.loadSnapshot(parentSnapshot);
                    releaseSnapshot(parentSnapshot);
                    applyCutInPlace(tableau, activeBranch.lastCut!);
                    const cells = tableau.height * tableau.width;
                    // snapshot taken at push + loaded now, then the in-place solve
                    snapshotRouteWork = ema(
                        snapshotRouteWork,
                        2 * COPY_COST * cells + (tableau.pivotCount - pivotsBefore) * cells
                    );
                } else {
                    applyCuts(tableau, activeBranch.cuts);
                    if (activeBranch.cuts.length > 0) {
                        const cells = tableau.height * tableau.width;
                        restoreWorkPerCut = ema(
                            restoreWorkPerCut,
                            (COPY_COST * cells + (tableau.pivotCount - pivotsBefore) * cells) /
                                activeBranch.cuts.length
                        );
                    }
                }
            }

            const cuts = activeBranch.cuts;

            iterations++;
            if (tableau.feasible === false) {
                continue;
            }
            if (iterations === 1 && strongBranching) {
                addRootCuts();
                // addRootCuts re-solves, so re-read feasibility (TS narrowed it).
                if ((tableau.feasible as boolean) === false) continue;
            }

            const evaluation = tableau.evaluation;
            const branchedOn = activeBranch.lastCut;
            if (branchedOn !== undefined && activeBranch.branchFractionality !== undefined) {
                const f = activeBranch.branchFractionality;
                const up = branchedOn.type === "min";
                pseudocosts.record(
                    branchedOn.varIndex,
                    up,
                    up ? 1 - f : f,
                    evaluation - activeBranch.relaxedEvaluation
                );
            }
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
                if (strongBranching) bestSnapshot = tableau.snapshot();
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

                if (strongBranching && bestEvaluation < Infinity) {
                    fixByReducedCost(evaluation);
                }
                const choice = selectBranchVariable(evaluation);
                if (choice === null) {
                    // Strong branching proved both children of every
                    // candidate's best split infeasible: prune this node.
                    continue;
                }
                const varIndex = choice.varIndex;
                const varValue = choice.value;

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
                branchHigh.branchFractionality = varValue - Math.floor(varValue);
                const branchLow = createBranch(evaluation, cutsLow);
                branchLow.lastCut = cutLow;
                branchLow.branchFractionality = branchHigh.branchFractionality;

                // Dive toward the nearer integer; queue the sibling.
                let sibling: Branch;
                if (chosenDownInfeasible || chosenUpInfeasible) {
                    // Strong branching already proved the other child
                    // infeasible: create only the feasible one.
                    diveBranch = chosenDownInfeasible ? branchHigh : branchLow;
                    diveCut = chosenDownInfeasible ? cutHigh : cutLow;
                    continue;
                }
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
                    const parentSnapshot = takeSnapshot();
                    snapshotBytes += parentSnapshot.matrix.byteLength;
                    sibling.parentSnapshot = parentSnapshot;
                }
                branches.push(sibling);
                recentSiblings.push(sibling);
            }
        }

        if (bestSnapshot !== null) {
            tableau.loadSnapshot(bestSnapshot);
            tableau.feasible = true;
            tableau.evaluation = bestEvaluation;
        } else if (bestBranch !== null) {
            applyCuts(tableau, bestBranch.cuts);
        }
        tableau.branchAndCutIterations = iterations;
    };

    return { applyCuts, branchAndCut };
}
