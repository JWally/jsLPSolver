import MilpSolution from "./milp-solution";
import Solution from "./solution";
import type Model from "../model";
import type { Constraint, Variable } from "../expressions";
import type { BranchCut, OptionalObjective, TableauSolution, VariableValue } from "./types";
import type { BranchAndCutService } from "./branch-and-cut";
import { createBranchAndCutService } from "./branch-and-cut";
import { simplex, phase1, phase2, pivot, checkForCycles } from "./simplex";
import {
    addLowerBoundMIRCut,
    addUpperBoundMIRCut,
    addCutConstraints,
    applyMIRCuts
} from "./cutting-strategies";
import {
    putInBase,
    takeOutOfBase,
    updateVariableValues,
    updateRightHandSide,
    updateConstraintCoefficient,
    updateCost,
    addConstraint,
    removeConstraint,
    addVariable,
    removeVariable
} from "./dynamic-modification";
import { log } from "./log";
import { copy, save, restore } from "./backup";
import { countIntegerValues, isIntegral, computeFractionalVolume } from "./integer-properties";
import { getMostFractionalVar, getFractionalVarWithLowestCost } from "./branching-strategies";

const createOptionalObjective = (
    priority: number,
    nColumns: number,
    reducedCosts?: number[]
): OptionalObjective => ({
    priority,
    reducedCosts: reducedCosts ? reducedCosts.slice() : new Array<number>(nColumns).fill(0),
    copy(): OptionalObjective {
        return createOptionalObjective(this.priority, this.reducedCosts.length, this.reducedCosts);
    },
});

export default class Tableau {
    model: Model | null;

    matrix: number[][];
    width: number;
    height: number;

    costRowIndex: number;
    rhsColumn: number;

    variablesPerIndex: Array<Variable | undefined>;
    unrestrictedVars: Record<number, boolean>;

    feasible: boolean;
    evaluation: number;
    simplexIters: number;

    varIndexByRow: number[];
    varIndexByCol: number[];

    rowByVarIndex: number[];
    colByVarIndex: number[];

    precision: number;

    optionalObjectives: OptionalObjective[];
    objectivesByPriority: Record<number, OptionalObjective>;
    optionalObjectivePerPriority: Record<number, OptionalObjective>;

    savedState: Tableau | null;

    availableIndexes: number[];
    lastElementIndex: number;

    variables: Variable[];
    nVars: number;

    bounded: boolean;
    unboundedVarIndex: number | null;

    branchAndCutIterations: number;
    bestPossibleEval: number;
    __isIntegral?: boolean;

    branchAndCutService: BranchAndCutService;

    simplex: typeof simplex;
    phase1: typeof phase1;
    phase2: typeof phase2;
    pivot: typeof pivot;
    checkForCycles: typeof checkForCycles;
    countIntegerValues: typeof countIntegerValues;
    isIntegral: typeof isIntegral;
    computeFractionalVolume: typeof computeFractionalVolume;
    addCutConstraints: typeof addCutConstraints;
    applyMIRCuts: typeof applyMIRCuts;
    putInBase: typeof putInBase;
    takeOutOfBase: typeof takeOutOfBase;
    addLowerBoundMIRCut: typeof addLowerBoundMIRCut;
    addUpperBoundMIRCut: typeof addUpperBoundMIRCut;
    updateVariableValues: typeof updateVariableValues;
    updateRightHandSide: typeof updateRightHandSide;
    updateConstraintCoefficient: typeof updateConstraintCoefficient;
    updateCost: typeof updateCost;
    addConstraint: typeof addConstraint;
    removeConstraint: typeof removeConstraint;
    addVariable: typeof addVariable;
    removeVariable: typeof removeVariable;
    log: typeof log;
    copy: typeof copy;
    save: typeof save;
    restore: typeof restore;
    getMostFractionalVar: typeof getMostFractionalVar;
    getFractionalVarWithLowestCost: typeof getFractionalVarWithLowestCost;

    constructor(precision = 1e-8, branchAndCutService: BranchAndCutService = createBranchAndCutService()) {
        this.model = null;

        this.matrix = [];
        this.width = 0;
        this.height = 0;

        this.costRowIndex = 0;
        this.rhsColumn = 0;

        this.variablesPerIndex = [];
        this.unrestrictedVars = {};

        // Solution attributes
        this.feasible = true; // until proven guilty
        this.evaluation = 0;
        this.simplexIters = 0;

        this.varIndexByRow = [];
        this.varIndexByCol = [];

        this.rowByVarIndex = [];
        this.colByVarIndex = [];

        this.precision = precision;

        this.optionalObjectives = [];
        this.objectivesByPriority = {};
        this.optionalObjectivePerPriority = {};

        this.savedState = null;

        this.availableIndexes = [];
        this.lastElementIndex = 0;

        this.variables = [];
        this.nVars = 0;

        this.bounded = true;
        this.unboundedVarIndex = null;

        this.branchAndCutIterations = 0;
        this.bestPossibleEval = 0;
        this.branchAndCutService = branchAndCutService;

        this.simplex = simplex;
        this.phase1 = phase1;
        this.phase2 = phase2;
        this.pivot = pivot;
        this.checkForCycles = checkForCycles;
        this.countIntegerValues = countIntegerValues;
        this.isIntegral = isIntegral;
        this.computeFractionalVolume = computeFractionalVolume;
        this.addCutConstraints = addCutConstraints;
        this.applyMIRCuts = applyMIRCuts;
        this.putInBase = putInBase;
        this.takeOutOfBase = takeOutOfBase;
        this.addLowerBoundMIRCut = addLowerBoundMIRCut;
        this.addUpperBoundMIRCut = addUpperBoundMIRCut;
        this.updateVariableValues = updateVariableValues;
        this.updateRightHandSide = updateRightHandSide;
        this.updateConstraintCoefficient = updateConstraintCoefficient;
        this.updateCost = updateCost;
        this.addConstraint = addConstraint;
        this.removeConstraint = removeConstraint;
        this.addVariable = addVariable;
        this.removeVariable = removeVariable;
        this.log = log;
        this.copy = copy;
        this.save = save;
        this.restore = restore;
        this.getMostFractionalVar = getMostFractionalVar;
        this.getFractionalVarWithLowestCost = getFractionalVarWithLowestCost;
    }

    solve(): TableauSolution {
        if (this.model?.getNumberOfIntegerVariables() ?? 0 > 0) {
            this.branchAndCut();
        } else {
            this.simplex();
        }
        this.updateVariableValues();
        return this.getSolution();
    }

    setOptionalObjective(priority: number, column: number, cost: number): void {
        let objectiveForPriority = this.objectivesByPriority[priority];
        if (objectiveForPriority === undefined) {
            const nColumns = Math.max(this.width, column + 1);
            objectiveForPriority = createOptionalObjective(priority, nColumns);
            this.objectivesByPriority[priority] = objectiveForPriority;
            this.optionalObjectivePerPriority[priority] = objectiveForPriority;
            this.optionalObjectives.push(objectiveForPriority);
            this.optionalObjectives.sort(function (a, b) {
                return a.priority - b.priority;
            });
        }

        objectiveForPriority.reducedCosts[column] = cost;
    }

    applyCuts(branchingCuts: BranchCut[]): void {
        this.branchAndCutService.applyCuts(this, branchingCuts);
    }

    branchAndCut(): void {
        this.branchAndCutService.branchAndCut(this);
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

        // BUILD AN EMPTY ARRAY OF THAT WIDTH
        const tmpRow = new Array<number>(width).fill(0);

        // BUILD AN EMPTY TABLEAU
        this.matrix = new Array<number[]>(height);
        for (let j = 0; j < height; j++) {
            this.matrix[j] = tmpRow.slice();
        }

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

        const variables = this.model.variables;
        const constraints = this.model.constraints;

        const nVars = variables.length;
        const nConstraints = constraints.length;

        let v: number;
        let varIndex: number;
        const costRow = this.matrix[0];
        const coeff = this.model.isMinimization === true ? -1 : 1;
        for (v = 0; v < nVars; v += 1) {
            const variable = variables[v];
            const priority = variable.priority;
            const cost = coeff * variable.cost;
            if (priority === 0) {
                costRow[v + 1] = cost;
            } else {
                this.setOptionalObjective(priority, v + 1, cost);
            }

            varIndex = variables[v].index;
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
            const row = this.matrix[rowIndex++];
            if (constraint.isUpperBound) {
                for (let t = 0; t < nTerms; t += 1) {
                    const term = terms[t];
                    const column = this.colByVarIndex[term.variable.index];
                    row[column] = term.coefficient;
                }

                row[0] = constraint.rhs;
            } else {
                for (let t = 0; t < nTerms; t += 1) {
                    const term = terms[t];
                    const column = this.colByVarIndex[term.variable.index];
                    row[column] = -term.coefficient;
                }

                row[0] = -constraint.rhs;
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
        for (let r = 0; r < this.height; r++) {
            const row = matrix[r];
            for (let c = 0; c < this.width; c++) {
                if (row[c] !== 0) {
                    density += 1;
                }
            }
        }

        return density / (this.height * this.width);
    }

    setEvaluation(): void {
        const roundingCoeff = Math.round(1 / this.precision);
        const evaluation = this.matrix[this.costRowIndex][this.rhsColumn];
        const roundedEvaluation =
            Math.round((Number.EPSILON + evaluation) * roundingCoeff) / roundingCoeff;

        this.evaluation = roundedEvaluation;
        if (this.simplexIters === 0) {
            this.bestPossibleEval = roundedEvaluation;
        }
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
}
