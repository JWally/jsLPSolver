import MilpSolution from "./MilpSolution";
import Solution from "./Solution";
import type Model from "../Model";
import type { Constraint, Variable } from "../expressions";
import type { BranchCut, OptionalObjective, TableauSolution, VariableValue } from "./types";

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

    simplex!: () => this;
    phase1!: () => number;
    phase2!: () => number;
    pivot!: (pivotRowIndex: number, pivotColumnIndex: number) => void;
    checkForCycles!: (varIndexes: Array<[number, number]>) => number[];
    countIntegerValues!: () => number;
    isIntegral!: () => boolean;
    computeFractionalVolume!: (ignoreIntegerValues?: boolean) => number;
    addCutConstraints!: (cutConstraints: BranchCut[]) => void;
    applyMIRCuts!: () => void;
    applyCuts!: (branchingCuts: BranchCut[]) => void;
    branchAndCut!: () => void;
    _putInBase!: (varIndex: number) => number;
    _takeOutOfBase!: (varIndex: number) => number;
    _addLowerBoundMIRCut!: (rowIndex: number) => boolean;
    _addUpperBoundMIRCut!: (rowIndex: number) => boolean;
    updateVariableValues!: () => void;
    updateRightHandSide!: (constraint: Constraint, difference: number) => void;
    updateConstraintCoefficient!: (
        constraint: Constraint,
        variable: Variable,
        difference: number
    ) => void;
    updateCost!: (variable: Variable, difference: number) => void;
    addConstraint!: (constraint: Constraint) => void;
    removeConstraint!: (constraint: Constraint) => void;
    addVariable!: (variable: Variable) => void;
    removeVariable!: (variable: Variable) => void;
    log!: (message: unknown, force?: boolean) => this;
    copy!: () => Tableau;
    save!: () => void;
    restore!: () => void;
    getMostFractionalVar!: () => VariableValue;
    getFractionalVarWithLowestCost!: () => VariableValue;

    constructor(precision = 1e-8) {
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
