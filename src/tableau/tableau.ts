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
import * as mipOps from "./mip-utils";
import { log as logImpl } from "./log";

function createOptionalObjective(
    priority: number,
    nColumns: number,
    reducedCosts?: number[]
): OptionalObjective {
    return {
        priority,
        reducedCosts: reducedCosts ? reducedCosts.slice() : new Array<number>(nColumns).fill(0),
        copy(): OptionalObjective {
            return createOptionalObjective(this.priority, this.reducedCosts.length, this.reducedCosts);
        },
    };
}

export default class Tableau {
    model: Model | null = null;

    matrix: Float64Array = new Float64Array(0);
    width = 0;
    height = 0;

    costRowIndex = 0;
    rhsColumn = 0;

    variablesPerIndex: Array<Variable | undefined> = [];
    unrestrictedVars: Record<number, boolean> = {};

    feasible = true;
    evaluation = 0;
    simplexIters = 0;

    varIndexByRow: number[] = [];
    varIndexByCol: number[] = [];

    rowByVarIndex: number[] = [];
    colByVarIndex: number[] = [];

    precision: number;

    optionalObjectives: OptionalObjective[] = [];
    objectivesByPriority: Record<number, OptionalObjective> = {};
    optionalObjectivePerPriority: Record<number, OptionalObjective> = {};

    savedState: Tableau | null = null;

    availableIndexes: number[] = [];
    lastElementIndex = 0;

    variables: Variable[] = [];
    nVars = 0;

    bounded = true;
    unboundedVarIndex: number | null = null;

    branchAndCutIterations = 0;
    bestPossibleEval = 0;
    __isIntegral?: boolean;

    // Partial pricing state for phase2 optimization
    pricingBatchStart = 1;
    pricingBatchSize = 0; // 0 means auto-compute based on problem size

    readonly branchAndCutService: BranchAndCutService;

    constructor(precision = 1e-8, branchAndCutService?: BranchAndCutService) {
        this.precision = precision;
        this.branchAndCutService = branchAndCutService ?? createBranchAndCutService();
    }

    // ========== Core Simplex Operations ==========

    simplex(): this {
        simplexOps.simplex.call(this);
        return this;
    }

    phase1(): number {
        return simplexOps.phase1.call(this);
    }

    phase2(): number {
        return simplexOps.phase2.call(this);
    }

    pivot(pivotRowIndex: number, pivotColumnIndex: number): void {
        simplexOps.pivot.call(this, pivotRowIndex, pivotColumnIndex);
    }

    checkForCycles(varIndexes: Array<[number, number]>): number[] {
        return simplexOps.checkForCycles.call(this, varIndexes);
    }

    // ========== Integer/MIP Properties ==========

    countIntegerValues(): number {
        return mipOps.countIntegerValues.call(this);
    }

    isIntegral(): boolean {
        return mipOps.isIntegral.call(this);
    }

    computeFractionalVolume(ignoreIntegerValues?: boolean): number {
        return mipOps.computeFractionalVolume.call(this, ignoreIntegerValues);
    }

    // ========== Cutting Strategies ==========

    addCutConstraints(branchingCuts: BranchCut[]): void {
        cuttingOps.addCutConstraints.call(this, branchingCuts);
    }

    applyMIRCuts(): void {
        cuttingOps.applyMIRCuts.call(this);
    }

    addLowerBoundMIRCut(rowIndex: number): boolean {
        return cuttingOps.addLowerBoundMIRCut.call(this, rowIndex);
    }

    addUpperBoundMIRCut(rowIndex: number): boolean {
        return cuttingOps.addUpperBoundMIRCut.call(this, rowIndex);
    }

    // ========== Branching Strategies ==========

    getMostFractionalVar(): VariableValue {
        return mipOps.getMostFractionalVar.call(this);
    }

    getFractionalVarWithLowestCost(): VariableValue {
        return mipOps.getFractionalVarWithLowestCost.call(this);
    }

    // ========== Dynamic Modification ==========

    putInBase(varIndex: number): number {
        return dynamicOps.putInBase.call(this, varIndex);
    }

    takeOutOfBase(varIndex: number): number {
        return dynamicOps.takeOutOfBase.call(this, varIndex);
    }

    updateVariableValues(): void {
        dynamicOps.updateVariableValues.call(this);
    }

    updateRightHandSide(constraint: Constraint, difference: number): void {
        dynamicOps.updateRightHandSide.call(this, constraint, difference);
    }

    updateConstraintCoefficient(constraint: Constraint, variable: Variable, difference: number): void {
        dynamicOps.updateConstraintCoefficient.call(this, constraint, variable, difference);
    }

    updateCost(variable: Variable, difference: number): void {
        dynamicOps.updateCost.call(this, variable, difference);
    }

    addConstraint(constraint: Constraint): void {
        dynamicOps.addConstraint.call(this, constraint);
    }

    removeConstraint(constraint: Constraint): void {
        dynamicOps.removeConstraint.call(this, constraint);
    }

    addVariable(variable: Variable): void {
        dynamicOps.addVariable.call(this, variable);
    }

    removeVariable(variable: Variable): void {
        dynamicOps.removeVariable.call(this, variable);
    }

    // ========== Backup/Restore ==========

    copy(): Tableau {
        return backupOps.copy.call(this);
    }

    save(): void {
        backupOps.save.call(this);
    }

    restore(): void {
        backupOps.restore.call(this);
    }

    // ========== Debug ==========

    log(message: unknown): this {
        logImpl.call(this, message);
        return this;
    }

    // ========== Branch and Cut ==========

    applyCuts(branchingCuts: BranchCut[]): void {
        this.branchAndCutService.applyCuts(this, branchingCuts);
    }

    branchAndCut(): void {
        this.branchAndCutService.branchAndCut(this);
    }

    // ========== Solution ==========

    solve(): TableauSolution {
        if ((this.model?.getNumberOfIntegerVariables() ?? 0) > 0) {
            this.branchAndCut();
        } else {
            this.simplex();
        }
        this.updateVariableValues();
        return this.getSolution();
    }

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

        let rowIndex = 1;
        for (let c = 0; c < nConstraints; c += 1) {
            const constraint = constraints[c];

            const constraintIndex = constraint.index;
            this.rowByVarIndex[constraintIndex] = rowIndex;
            this.colByVarIndex[constraintIndex] = -1;
            this.varIndexByRow[rowIndex] = constraintIndex;

            const terms = constraint.terms;
            const nTerms = terms.length;
            const rowOffset = rowIndex * width;
            rowIndex++;

            if (constraint.isUpperBound) {
                for (let t = 0; t < nTerms; t += 1) {
                    const term = terms[t];
                    const column = this.colByVarIndex[term.variable.index];
                    matrix[rowOffset + column] = term.coefficient;
                }
                matrix[rowOffset] = constraint.rhs;
            } else {
                for (let t = 0; t < nTerms; t += 1) {
                    const term = terms[t];
                    const column = this.colByVarIndex[term.variable.index];
                    matrix[rowOffset + column] = -term.coefficient;
                }
                matrix[rowOffset] = -constraint.rhs;
            }
        }
    }

    setModel(model: Model): this {
        this.model = model;

        const width = model.nVariables + 1;
        const height = model.nConstraints + 1;

        this.initialize(width, height, model.variables, model.unrestrictedVariables);
        this._resetMatrix();
        return this;
    }

    getNewElementIndex(): number {
        if (this.availableIndexes.length > 0) {
            return this.availableIndexes.pop() as number;
        }

        const index = this.lastElementIndex;
        this.lastElementIndex += 1;
        return index;
    }

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
