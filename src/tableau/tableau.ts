/**
 * @file src/tableau/tableau.ts
 * @description Core Tableau class for the simplex algorithm
 *
 * The Tableau represents the LP problem in matrix form and provides:
 * - Matrix storage using Float64Array for numerical precision
 * - Variable and constraint index management
 * - Simplex operations (via bound function imports)
 * - Branch-and-cut integration for MIP solving
 * - Save/restore for backtracking during B&B
 */
import { Solution, MilpSolution } from "./solution";
import type Model from "../model";
import type { Constraint, Variable } from "../expressions";
import type { BranchCut, OptionalObjective, TableauSolution, VariableValue } from "./types";
import type { BranchAndCutService } from "./branch-and-cut";
import { createBranchAndCutService } from "./branch-and-cut";

// Import implementations
import * as simplexOps from "./simplex";
import * as cuttingOps from "./cutting-strategies";
import * as dynamicOps from "./dynamic-modification";
import * as backupOps from "./backup";
import { setVariableBounds } from "./bounds";
import * as mipOps from "./mip-utils";
import { log as logImpl } from "./log";

/**
 * Factory for OptionalObjective instances.
 * @param priority - Priority level (lower = higher priority).
 * @param nColumns - Number of columns to allocate for reduced costs.
 * @param reducedCosts - Initial reduced costs (copied if provided).
 */
function createOptionalObjective(
    priority: number,
    nColumns: number,
    reducedCosts?: number[]
): OptionalObjective {
    return {
        priority,
        reducedCosts: reducedCosts ? reducedCosts.slice() : new Array<number>(nColumns).fill(0),
        copy(): OptionalObjective {
            return createOptionalObjective(
                this.priority,
                this.reducedCosts.length,
                this.reducedCosts
            );
        },
    };
}

/**
 * Core simplex tableau data structure.
 *
 * Stores the LP problem in matrix form (Float64Array for numerical precision)
 * and provides methods for simplex operations, branch-and-cut, and dynamic
 * model modification. Each row represents a basic variable; each column
 * represents a non-basic variable. The first row is the cost (objective) row;
 * the first column is the RHS column.
 *
 * This class delegates its method implementations to separate modules
 * (simplex, cutting-strategies, backup, etc.) for maintainability.
 */
export default class Tableau {
    /** The model this tableau was built from (null until setModel is called). */
    model: Model | null = null;

    /** Flat row-major matrix storage. Element at (row, col) is matrix[row * width + col]. */
    matrix: Float64Array = new Float64Array(0);
    /** Number of columns (non-basic variables + RHS column). */
    width = 0;
    /** Number of rows (basic variables + cost row). */
    height = 0;

    /** Row index of the objective function (always 0). */
    costRowIndex = 0;
    /** Column index of the RHS values (always 0). */
    rhsColumn = 0;

    /** Lookup table: internal variable index -> Variable object. */
    variablesPerIndex: Array<Variable | undefined> = [];
    /** Set of variable indices that are unrestricted (may be negative). */
    unrestrictedVars: Record<number, boolean> = {};

    /** Whether the current solution is feasible. Set to false by phase 1 if no BFS found. */
    feasible = true;
    /** Current objective function value (negated internally for minimization). */
    evaluation = 0;
    /** Total simplex iterations performed across all phases. */
    simplexIters = 0;

    /** Maps row index -> variable index of the basic variable in that row. */
    varIndexByRow: number[] = [];
    /** Maps column index -> variable index of the non-basic variable in that column. */
    varIndexByCol: number[] = [];

    /** Maps variable index -> row index (-1 if non-basic). */
    rowByVarIndex: number[] = [];
    /** Maps variable index -> column index (-1 if basic). */
    colByVarIndex: number[] = [];

    /** Numerical precision tolerance for integrality and zero comparisons. */
    precision: number;

    /** Secondary objectives sorted by priority (for hierarchical optimization). */
    optionalObjectives: OptionalObjective[] = [];
    /** Lookup: priority level -> optional objective. */
    objectivesByPriority: Record<number, OptionalObjective> = {};
    /** Alias for objectivesByPriority (legacy compatibility). */
    optionalObjectivePerPriority: Record<number, OptionalObjective> = {};

    /** Saved tableau state for branch-and-cut restoration. */
    savedState: Tableau | null = null;

    /** Pivots performed so far (deterministic work measure for branch-and-cut). */
    pivotCount = 0;
    /**
     * When positive, a dual phase 1 from a dual-feasible basis stops after
     * this many iterations and reports its objective (a valid bound) with
     * iterationLimited set. Used by strong branching, which only needs bounds.
     */
    dualIterationLimit = 0;
    /** Whether the last simplex() stopped at dualIterationLimit. */
    iterationLimited = false;
    /**
     * Row equilibration factor per constraint (indexed by the constraint's
     * slack variable index; absent means 1). Each constraint row is stored
     * multiplied by a power of two that brings its largest coefficient near
     * 1, so the slack is measured on a comparable scale to the structurals
     * and the fixed tolerances mean the same thing on every row.
     */
    rowScale: Float64Array = new Float64Array(0);

    /** True once any column bound has been set (see bounds.ts). */
    hasBounds = false;
    /**
     * Per variable index (dense, allocated on first use; see bounds.ts):
     * x = boundOffset + boundSign * stored, stored in [0, boundRange],
     * actual bounds [boundLower, boundUpper].
     */
    boundOffset: Float64Array = new Float64Array(0);
    boundSign: Float64Array = new Float64Array(0);
    boundRange: Float64Array = new Float64Array(0);
    boundLower: Float64Array = new Float64Array(0);
    boundUpper: Float64Array = new Float64Array(0);

    /** Pool of recycled variable/constraint indices. */
    availableIndexes: number[] = [];
    /** Next fresh index to assign (when pool is empty). */
    lastElementIndex = 0;

    /** All decision variables in column order. */
    variables: Variable[] = [];
    /** Total number of variable/constraint indices allocated. */
    nVars = 0;

    /** Whether the problem is bounded (set to false if unbounded ray detected). */
    bounded = true;
    /** Index of the unbounded variable (if bounded is false). */
    unboundedVarIndex: number | null = null;

    /** Number of B&B nodes explored in the last branchAndCut call. */
    branchAndCutIterations = 0;
    /** Best possible objective value (LP relaxation at root). */
    bestPossibleEval = 0;
    /** Set to true when the current solution satisfies all integrality constraints. */
    __isIntegral?: boolean;

    /** Starting column for partial pricing sweep in phase 2. */
    pricingBatchStart = 1;
    /** Batch size for partial pricing (0 = auto-compute based on problem size). */
    pricingBatchSize = 0;

    /** The branch-and-cut strategy used for MIP solving. */
    readonly branchAndCutService: BranchAndCutService;

    /**
     * @param precision - Numerical tolerance for zero/integrality tests (default: 1e-8).
     * @param branchAndCutService - Custom B&C strategy (default: basic best-first).
     */
    constructor(precision = 1e-8, branchAndCutService?: BranchAndCutService) {
        this.precision = precision;
        this.branchAndCutService = branchAndCutService ?? createBranchAndCutService();
    }

    // ========== Core Simplex Operations ==========

    /** Run two-phase simplex to find the optimal LP solution. */
    simplex(): this {
        simplexOps.simplex.call(this);
        return this;
    }

    /** Phase 1: Find a basic feasible solution. @returns Pivot iteration count. */
    phase1(): number {
        return simplexOps.phase1.call(this);
    }

    /** Phase 2: Optimize the objective. @returns Pivot iteration count. */
    phase2(): number {
        return simplexOps.phase2.call(this);
    }

    /**
     * Dual simplex for warm-starting after adding bound constraints.
     * Use when solution is dual feasible but may be primal infeasible.
     * @returns Number of iterations, or -1 if dual infeasible
     */
    dualSimplex(): number {
        return simplexOps.dualSimplex.call(this);
    }

    /**
     * Perform a single simplex pivot.
     * @param pivotRowIndex - Row of the leaving variable.
     * @param pivotColumnIndex - Column of the entering variable.
     */
    pivot(pivotRowIndex: number, pivotColumnIndex: number): void {
        simplexOps.pivot.call(this, pivotRowIndex, pivotColumnIndex);
    }

    /** Detect pivot cycles in a history of (leaving, entering) pairs. */
    checkForCycles(varIndexes: Array<[number, number]>): number[] {
        return simplexOps.checkForCycles.call(this, varIndexes);
    }

    // ========== Integer/MIP Properties ==========

    /** Count how many integer variables currently have integral values. */
    countIntegerValues(): number {
        return mipOps.countIntegerValues.call(this);
    }

    /** Check if all integer variables have integral values within precision. */
    isIntegral(): boolean {
        return mipOps.isIntegral.call(this);
    }

    /**
     * Compute sum of fractionalities of integer variables.
     * @param ignoreIntegerValues - If true, skip variables that are already integral.
     * @returns Total fractional volume (0 = all integral).
     */
    computeFractionalVolume(ignoreIntegerValues?: boolean): number {
        return mipOps.computeFractionalVolume.call(this, ignoreIntegerValues);
    }

    // ========== Cutting Strategies ==========

    /** Add bound constraints and grow the tableau as needed. */
    addCutConstraints(branchingCuts: BranchCut[]): void {
        cuttingOps.addCutConstraints.call(this, branchingCuts);
    }

    /** Apply MIR cuts to all fractional integer rows. */
    applyMIRCuts(): void {
        cuttingOps.applyMIRCuts.call(this);
    }

    /** Add a lower-bound MIR cut from the given row. @returns True if cut was added. */
    addLowerBoundMIRCut(rowIndex: number): boolean {
        return cuttingOps.addLowerBoundMIRCut.call(this, rowIndex);
    }

    /** Add an upper-bound MIR cut from the given row. @returns True if cut was added. */
    addUpperBoundMIRCut(rowIndex: number): boolean {
        return cuttingOps.addUpperBoundMIRCut.call(this, rowIndex);
    }

    // ========== Branching Strategies ==========

    /** Find the integer variable with the most fractional current value. */
    getMostFractionalVar(): VariableValue {
        return mipOps.getMostFractionalVar.call(this);
    }

    /** Find the fractional integer variable with the lowest objective cost. */
    getFractionalVarWithLowestCost(): VariableValue {
        return mipOps.getFractionalVarWithLowestCost.call(this);
    }

    // ========== Dynamic Modification ==========

    /** Pivot a variable into the basis. @returns Its new row index. */
    putInBase(varIndex: number): number {
        return dynamicOps.putInBase.call(this, varIndex);
    }

    /** Pivot a variable out of the basis. @returns Its new column index. */
    takeOutOfBase(varIndex: number): number {
        return dynamicOps.takeOutOfBase.call(this, varIndex);
    }

    /** Read variable values from the matrix into Variable.value. */
    updateVariableValues(): void {
        dynamicOps.updateVariableValues.call(this);
    }

    /** Update a constraint's RHS in the active tableau. */
    updateRightHandSide(constraint: Constraint, difference: number): void {
        dynamicOps.updateRightHandSide.call(this, constraint, difference);
    }

    /** Update a variable's coefficient in a constraint. */
    updateConstraintCoefficient(
        constraint: Constraint,
        variable: Variable,
        difference: number
    ): void {
        dynamicOps.updateConstraintCoefficient.call(this, constraint, variable, difference);
    }

    /** Update a variable's objective coefficient. */
    updateCost(variable: Variable, difference: number): void {
        dynamicOps.updateCost.call(this, variable, difference);
    }

    /** Add a new constraint row to the tableau. */
    addConstraint(constraint: Constraint): void {
        dynamicOps.addConstraint.call(this, constraint);
    }

    /** Remove a constraint row from the tableau. */
    removeConstraint(constraint: Constraint): void {
        dynamicOps.removeConstraint.call(this, constraint);
    }

    /** Add a new variable column to the tableau. */
    addVariable(variable: Variable): void {
        dynamicOps.addVariable.call(this, variable);
    }

    /** Remove a variable column from the tableau. */
    removeVariable(variable: Variable): void {
        dynamicOps.removeVariable.call(this, variable);
    }

    // ========== Backup/Restore ==========

    /** Create a deep copy of this tableau's mutable state. */
    copy(): Tableau {
        return backupOps.copy.call(this);
    }

    /** Snapshot the current state for later restoration. */
    save(): void {
        backupOps.save.call(this);
    }

    /** Restore the tableau to its previously saved state. */
    restore(): void {
        backupOps.restore.call(this);
    }

    /** Capture the current node's LP state (see backup.snapshot). */
    snapshot(): backupOps.NodeSnapshot {
        return backupOps.snapshot.call(this);
    }

    /** Load a node LP state captured by snapshot(). */
    loadSnapshot(snap: backupOps.NodeSnapshot): void {
        backupOps.loadSnapshot.call(this, snap);
    }

    // ========== Debug ==========

    /** Print the tableau matrix to console for debugging. */
    log(message: unknown): this {
        logImpl.call(this, message);
        return this;
    }

    // ========== Branch and Cut ==========

    /** Apply branch cuts and re-solve the LP relaxation. */
    applyCuts(branchingCuts: BranchCut[]): void {
        this.branchAndCutService.applyCuts(this, branchingCuts);
    }

    /** Run branch-and-cut to find an integer-optimal solution. */
    branchAndCut(): void {
        this.branchAndCutService.branchAndCut(this);
    }

    // ========== Solution ==========

    /**
     * Solve the problem: run B&C for MIP or simplex for LP, then extract the solution.
     * @returns The complete solution object.
     */
    solve(): TableauSolution {
        if ((this.model?.getNumberOfIntegerVariables() ?? 0) > 0) {
            this.branchAndCut();
        } else {
            this.simplex();
        }
        this.updateVariableValues();
        return this.getSolution();
    }

    /** Build a Solution or MilpSolution from the current tableau state. */
    getSolution(): TableauSolution {
        const evaluation = this.model?.isMinimization === true ? this.evaluation : -this.evaluation;

        if ((this.model?.getNumberOfIntegerVariables() ?? 0) > 0) {
            return new MilpSolution(
                this,
                evaluation,
                this.feasible,
                this.bounded,
                this.branchAndCutIterations
            );
        } else {
            return new Solution(this, evaluation, this.feasible, this.bounded);
        }
    }

    // ========== Initialization ==========

    /**
     * Register or update a secondary (optional) objective at the given priority.
     * @param priority - Priority level (lower = optimized first).
     * @param column - Column index for the reduced cost entry.
     * @param cost - Reduced cost value for this variable in this objective.
     */
    setOptionalObjective(priority: number, column: number, cost: number): void {
        let objectiveForPriority = this.objectivesByPriority[priority];
        if (objectiveForPriority === undefined) {
            const nColumns = Math.max(this.width, column + 1);
            objectiveForPriority = createOptionalObjective(priority, nColumns);
            this.objectivesByPriority[priority] = objectiveForPriority;
            this.optionalObjectivePerPriority[priority] = objectiveForPriority;
            this.optionalObjectives.push(objectiveForPriority);
            this.optionalObjectives.sort((a, b) => a.priority - b.priority);
        }

        objectiveForPriority.reducedCosts[column] = cost;
    }

    /**
     * Allocate and initialize the tableau's matrix and index arrays.
     * Called by setModel; should not be called directly.
     *
     * @param width - Number of columns (variables + 1).
     * @param height - Number of rows (constraints + 1).
     * @param variables - All decision variables.
     * @param unrestrictedVars - Set of unrestricted variable indices.
     */
    initialize(
        width: number,
        height: number,
        variables: Variable[],
        unrestrictedVars: Record<number, boolean>
    ): void {
        this.variables = variables;
        this.unrestrictedVars = unrestrictedVars;

        this.width = width;
        this.height = height;

        this.matrix = new Float64Array(width * height);

        this.varIndexByRow = new Array<number>(this.height);
        this.varIndexByCol = new Array<number>(this.width);

        this.varIndexByRow[0] = -1;
        this.varIndexByCol[0] = -1;

        this.nVars = width + height - 2;
        this.rowByVarIndex = new Array<number>(this.nVars);
        this.colByVarIndex = new Array<number>(this.nVars);

        this.lastElementIndex = this.nVars;
    }

    /** Populate the matrix with objective coefficients and constraint data from the model. */
    _resetMatrix(): void {
        if (this.model === null) {
            throw new Error("[Tableau._resetMatrix] Model not set");
        }

        const matrix = this.matrix;
        const width = this.width;
        const variables = this.model.variables;
        const constraints = this.model.constraints;

        const nVars = variables.length;
        const nConstraints = constraints.length;

        const coeff = this.model.isMinimization === true ? -1 : 1;

        for (let v = 0; v < nVars; v += 1) {
            const variable = variables[v];
            const priority = variable.priority;
            const cost = coeff * variable.cost;
            if (priority === 0) {
                matrix[v + 1] = cost;
            } else {
                this.setOptionalObjective(priority, v + 1, cost);
            }

            const varIndex = variables[v].index;
            this.rowByVarIndex[varIndex] = -1;
            this.colByVarIndex[varIndex] = v + 1;
            this.varIndexByCol[v + 1] = varIndex;
        }

        this.rowScale = new Float64Array(this.nVars);
        let rowIndex = 1;
        for (let c = 0; c < nConstraints; c += 1) {
            const constraint = constraints[c];
            const scale = equilibrationScale(constraint.terms);
            this.rowScale[constraint.index] = scale;

            const constraintIndex = constraint.index;
            this.rowByVarIndex[constraintIndex] = rowIndex;
            this.colByVarIndex[constraintIndex] = -1;
            this.varIndexByRow[rowIndex] = constraintIndex;

            const terms = constraint.terms;
            const nTerms = terms.length;
            const rowOffset = rowIndex * width;
            rowIndex++;

            const sign = constraint.isUpperBound ? scale : -scale;
            for (let t = 0; t < nTerms; t += 1) {
                const term = terms[t];
                const column = this.colByVarIndex[term.variable.index];
                matrix[rowOffset + column] = sign * term.coefficient;
            }
            matrix[rowOffset] = sign * constraint.rhs;
        }
    }

    /**
     * Initialize the tableau from a Model instance.
     * Allocates the matrix and populates it with the model's data.
     * @param model - The optimization model to load.
     * @returns This tableau for chaining.
     */
    setModel(model: Model): this {
        this.model = model;

        const width = model.nVariables + 1;
        const height = model.nConstraints + 1;

        this.initialize(width, height, model.variables, model.unrestrictedVariables);
        this._resetMatrix();
        for (const [variable, bound] of model.columnBounds) {
            setVariableBounds(this, variable.index, bound.lb, bound.ub);
        }
        return this;
    }

    /** Allocate a new variable/constraint index (reuses from pool if available). */
    getNewElementIndex(): number {
        if (this.availableIndexes.length > 0) {
            return this.availableIndexes.pop() as number;
        }

        const index = this.lastElementIndex;
        this.lastElementIndex += 1;
        return index;
    }

    /** Compute the fraction of non-zero entries in the matrix (for sparsity analysis). */
    density(): number {
        let density = 0;

        const matrix = this.matrix;
        const width = this.width;
        for (let r = 0; r < this.height; r++) {
            const rowOffset = r * width;
            for (let c = 0; c < width; c++) {
                if (matrix[rowOffset + c] !== 0) {
                    density += 1;
                }
            }
        }

        return density / (this.height * this.width);
    }

    /** Read the objective value from the matrix, round to precision, and store in this.evaluation. */
    setEvaluation(): void {
        const roundingCoeff = Math.round(1 / this.precision);
        const evaluation = this.matrix[this.costRowIndex * this.width + this.rhsColumn];
        const roundedEvaluation =
            Math.round((Number.EPSILON + evaluation) * roundingCoeff) / roundingCoeff;

        this.evaluation = roundedEvaluation;
        if (this.simplexIters === 0) {
            this.bestPossibleEval = roundedEvaluation;
        }
    }
}

/**
 * Power of two that brings a row's largest absolute coefficient into [0.5, 1).
 * Powers of two scale exactly in binary floating point, so equilibration adds
 * no rounding error of its own.
 */
function equilibrationScale(terms: ReadonlyArray<{ coefficient: number }>): number {
    let largest = 0;
    for (let t = 0; t < terms.length; t++) {
        const magnitude = Math.abs(terms[t].coefficient);
        if (magnitude > largest) largest = magnitude;
    }
    if (!(largest > 0) || !Number.isFinite(largest)) return 1;
    return Math.pow(2, -Math.ceil(Math.log2(largest)));
}
