import type Model from "./Model";

export type Priority = number | "required" | "strong" | "medium" | "weak";

export class Variable {
    id: string;
    cost: number;
    index: number;
    value: number;
    priority: number;
    isInteger?: true;
    isSlack?: true;

    constructor(id: string, cost: number, index: number, priority: number) {
        this.id = id;
        this.cost = cost;
        this.index = index;
        this.value = 0;
        this.priority = priority;
    }
}

export class IntegerVariable extends Variable {
    isInteger: true = true;

    constructor(id: string, cost: number, index: number, priority: number) {
        super(id, cost, index, priority);
    }
}

export class SlackVariable extends Variable {
    isSlack: true = true;

    constructor(id: string, index: number) {
        super(id, 0, index, 0);
    }
}

export class Term {
    variable: Variable;
    coefficient: number;

    constructor(variable: Variable, coefficient: number) {
        this.variable = variable;
        this.coefficient = coefficient;
    }
}

type RelaxationModel = Model & {
    addVariable(
        cost: number,
        id: string,
        isInteger?: boolean,
        isUnrestricted?: boolean,
        priority?: number
    ): Variable;
};

export function createRelaxationVariable(
    model: RelaxationModel,
    weight?: number,
    priority?: Priority
): Variable | null {
    if (priority === 0 || priority === "required") {
        return null;
    }

    const normalizedWeight = weight === undefined ? 1 : weight;
    const normalizedPriority = priority === undefined ? 1 : priority;

    const actualWeight = model.isMinimization === false ? -normalizedWeight : normalizedWeight;

    return model.addVariable(
        actualWeight,
        "r" + model.relaxationIndex++,
        false,
        false,
        normalizedPriority as number
    );
}

export class Constraint {
    slack: SlackVariable;
    index: number;
    model: RelaxationModel;
    rhs: number;
    isUpperBound: boolean;
    terms: Term[];
    termsByVarIndex: Record<number, Term>;
    relaxation: Variable | null;

    constructor(rhs: number, isUpperBound: boolean, index: number, model: RelaxationModel) {
        this.slack = new SlackVariable("s" + index, index);
        this.index = index;
        this.model = model;
        this.rhs = rhs;
        this.isUpperBound = isUpperBound;

        this.terms = [];
        this.termsByVarIndex = {};

        this.relaxation = null;
    }

    addTerm(coefficient: number, variable: Variable): this {
        const varIndex = variable.index;
        const term = this.termsByVarIndex[varIndex];
        if (term === undefined) {
            // No term for given variable
            const newTerm = new Term(variable, coefficient);
            this.termsByVarIndex[varIndex] = newTerm;
            this.terms.push(newTerm);
            const signedCoefficient = this.isUpperBound === true ? -coefficient : coefficient;
            this.model.updateConstraintCoefficient(this, variable, signedCoefficient);
        } else {
            // Term for given variable already exists
            // updating its coefficient
            const newCoefficient = term.coefficient + coefficient;
            this.setVariableCoefficient(newCoefficient, variable);
        }

        return this;
    }

    // TODO: Implement term removal if required by consumers.
    removeTerm(_term: Term): this {
        return this;
    }

    setRightHandSide(newRhs: number): this {
        if (newRhs !== this.rhs) {
            let difference = newRhs - this.rhs;
            if (this.isUpperBound === true) {
                difference = -difference;
            }

            this.rhs = newRhs;
            this.model.updateRightHandSide(this, difference);
        }

        return this;
    }

    setVariableCoefficient(newCoefficient: number, variable: Variable): this | void {
        const varIndex = variable.index;
        if (varIndex === -1) {
            console.warn(
                "[Constraint.setVariableCoefficient] Trying to change coefficient of inexistant variable."
            );
            return;
        }

        const term = this.termsByVarIndex[varIndex];
        if (term === undefined) {
            // No term for given variable
            this.addTerm(newCoefficient, variable);
        } else if (newCoefficient !== term.coefficient) {
            // Term for given variable already exists
            // updating its coefficient if changed
            let difference = newCoefficient - term.coefficient;
            if (this.isUpperBound === true) {
                difference = -difference;
            }

            term.coefficient = newCoefficient;
            this.model.updateConstraintCoefficient(this, variable, difference);
        }

        return this;
    }

    relax(weight?: number, priority?: Priority): void {
        this.relaxation = createRelaxationVariable(this.model, weight, priority);
        this._relax(this.relaxation);
    }

    _relax(relaxationVariable: Variable | null): void {
        if (relaxationVariable === null) {
            // Relaxation variable not created, priority was probably "required"
            return;
        }

        if (this.isUpperBound) {
            this.setVariableCoefficient(-1, relaxationVariable);
        } else {
            this.setVariableCoefficient(1, relaxationVariable);
        }
    }
}

export class Equality {
    upperBound: Constraint;
    lowerBound: Constraint;
    model: RelaxationModel;
    rhs: number;
    relaxation: Variable | null;
    isEquality: true = true;

    constructor(constraintUpper: Constraint, constraintLower: Constraint) {
        this.upperBound = constraintUpper;
        this.lowerBound = constraintLower;
        this.model = constraintUpper.model;
        this.rhs = constraintUpper.rhs;
        this.relaxation = null;
    }

    addTerm(coefficient: number, variable: Variable): this {
        this.upperBound.addTerm(coefficient, variable);
        this.lowerBound.addTerm(coefficient, variable);
        return this;
    }

    // TODO: Implement term removal if required by consumers.
    removeTerm(_term: Term): this {
        this.upperBound.removeTerm(_term);
        this.lowerBound.removeTerm(_term);
        return this;
    }

    setRightHandSide(rhs: number): void {
        this.upperBound.setRightHandSide(rhs);
        this.lowerBound.setRightHandSide(rhs);
        this.rhs = rhs;
    }

    relax(weight?: number, priority?: Priority): void {
        this.relaxation = createRelaxationVariable(this.model, weight, priority);
        this.upperBound.relaxation = this.relaxation;
        this.upperBound._relax(this.relaxation);
        this.lowerBound.relaxation = this.relaxation;
        this.lowerBound._relax(this.relaxation);
    }
}

export class Numeral {
    value: number;

    constructor(value: number) {
        this.value = value;
    }
}
