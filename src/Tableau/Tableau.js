import Solution from "./Solution.js";
import MilpSolution from "./MilpSolution.js";

class OptionalObjective {
    constructor(priority, nColumns) {
        this.priority = priority;
        this.reducedCosts = new Array(nColumns);
        for (var c = 0; c < nColumns; c += 1) {
            this.reducedCosts[c] = 0;
        }
    }

    copy() {
        var copy = new OptionalObjective(this.priority, this.reducedCosts.length);
        copy.reducedCosts = this.reducedCosts.slice();
        return copy;
    }
}

/*************************************************************
 * Class: Tableau
 * Description: Simplex tableau, holding a the tableau matrix
 *              and all the information necessary to perform
 *              the simplex algorithm
 * Agruments:
 *        precision: If we're solving a MILP, how tight
 *                   do we want to define an integer, given
 *                   that 20.000000000000001 is not an integer.
 *                   (defaults to 1e-8)
 **************************************************************/
export default class Tableau {
    constructor(precision) {
        this.model = null;

        this.matrix = null;
        this.width = 0;
        this.height = 0;

        this.costRowIndex = 0;
        this.rhsColumn = 0;

        this.variablesPerIndex = [];
        this.unrestrictedVars = null;

        // Solution attributes
        this.feasible = true; // until proven guilty
        this.evaluation = 0;
        this.simplexIters = 0;

        this.varIndexByRow = null;
        this.varIndexByCol = null;

        this.rowByVarIndex = null;
        this.colByVarIndex = null;

        this.precision = precision || 1e-8;

        this.optionalObjectives = [];
        this.objectivesByPriority = {};

        this.savedState = null;

        this.availableIndexes = [];
        this.lastElementIndex = 0;

        this.variables = null;
        this.nVars = 0;

        this.bounded = true;
        this.unboundedVarIndex = null;

        this.branchAndCutIterations = 0;
    }

    solve() {
        if (this.model.getNumberOfIntegerVariables() > 0) {
            this.branchAndCut();
        } else {
            this.simplex();
        }
        this.updateVariableValues();
        return this.getSolution();
    }


    setOptionalObjective(priority, column, cost) {
        let objectiveForPriority = this.objectivesByPriority[priority];
        if (objectiveForPriority === undefined) {
            const nColumns = Math.max(this.width, column + 1);
            objectiveForPriority = new OptionalObjective(priority, nColumns);
            this.objectivesByPriority[priority] = objectiveForPriority;
            this.optionalObjectives.push(objectiveForPriority);
            this.optionalObjectives.sort(function (a, b) {
                return a.priority - b.priority;
            });
        }

        objectiveForPriority.reducedCosts[column] = cost;
    }

    //-------------------------------------------------------------------
    //-------------------------------------------------------------------
    initialize(width, height, variables, unrestrictedVars) {
        this.variables = variables;
        this.unrestrictedVars = unrestrictedVars;

        this.width = width;
        this.height = height;


        // console.time("tableau_build");
        // BUILD AN EMPTY ARRAY OF THAT WIDTH
        var tmpRow = new Array(width);
        for (let i = 0; i < width; i++) {
            tmpRow[i] = 0;
        }

        // BUILD AN EMPTY TABLEAU
        this.matrix = new Array(height);
        for (let j = 0; j < height; j++) {
            this.matrix[j] = tmpRow.slice();
        }

        //
        // TODO: Benchmark This
        //this.matrix = new Array(height).fill(0).map(() => new Array(width).fill(0));

        // console.timeEnd("tableau_build");
        // console.log("height",height);
        // console.log("width",width);
        // console.log("------");
        // console.log("");


        this.varIndexByRow = new Array(this.height);
        this.varIndexByCol = new Array(this.width);

        this.varIndexByRow[0] = -1;
        this.varIndexByCol[0] = -1;

        this.nVars = width + height - 2;
        this.rowByVarIndex = new Array(this.nVars);
        this.colByVarIndex = new Array(this.nVars);

        this.lastElementIndex = this.nVars;
    }

    _resetMatrix() {
        var variables = this.model.variables;
        var constraints = this.model.constraints;

        var nVars = variables.length;
        // var nConstraints = constraints.length;

        var varIndex;
        var costRow = this.matrix[0];
        var coeff = (this.model.isMinimization === true) ? -1 : 1;
        for (let v = 0; v < nVars; v += 1) {
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

        // var rowIndex = 1;
        for (let c = 0, rowIndex =1; c < constraints.length; c++) {
            const constraint = constraints[c];

            const constraintIndex = constraint.index;
            this.rowByVarIndex[constraintIndex] = rowIndex;
            this.colByVarIndex[constraintIndex] = -1;
            this.varIndexByRow[rowIndex] = constraintIndex;

            let term, column;
            const terms = constraint.terms;
            const nTerms = terms.length;
            const row = this.matrix[rowIndex++];
            if (constraint.isUpperBound) {
                for (let t = 0; t < nTerms; t += 1) {
                    term = terms[t];
                    column = this.colByVarIndex[term.variable.index];
                    row[column] = term.coefficient;
                }

                row[0] = constraint.rhs;
            } else {
                for (let t = 0; t < nTerms; t += 1) {
                    term = terms[t];
                    column = this.colByVarIndex[term.variable.index];
                    row[column] = -term.coefficient;
                }

                row[0] = -constraint.rhs;
            }
        }
    }

    //-------------------------------------------------------------------
    //-------------------------------------------------------------------
    setModel(model) {
        this.model = model;

        const width = model.variables.length + 1;
        const height = model.constraints.length + 1;


        this.initialize(width, height, model.variables, model.unrestrictedVariables);
        this._resetMatrix();
        return this;
    }

    getNewElementIndex() {
        if (this.availableIndexes.length > 0) {
            return this.availableIndexes.pop();
        }

        const index = this.lastElementIndex;
        this.lastElementIndex += 1;
        return index;
    }

    density() {
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

    //-------------------------------------------------------------------
    //-------------------------------------------------------------------
    setEvaluation() {
        // Rounding objective value
        const roundingCoeff = Math.round(1 / this.precision);
        const evaluation = this.matrix[this.costRowIndex][this.rhsColumn];
        const roundedEvaluation =
            Math.round((Number.EPSILON + evaluation) * roundingCoeff) / roundingCoeff;

        this.evaluation = roundedEvaluation;
        if (this.simplexIters === 0) {
            this.bestPossibleEval = roundedEvaluation;
        }
    }

    //-------------------------------------------------------------------
    //-------------------------------------------------------------------
    getSolution() {
        const evaluation = (this.model.isMinimization === true) ?
            this.evaluation : -this.evaluation;

        if (this.model.getNumberOfIntegerVariables() > 0) {
            return new MilpSolution(this, evaluation, this.feasible, this.bounded, this.branchAndCutIterations);
        } else {
            return new Solution(this, evaluation, this.feasible, this.bounded);
        }
    }
}
