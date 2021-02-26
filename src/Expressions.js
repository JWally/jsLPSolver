
//-------------------------------------------------------------------
//-------------------------------------------------------------------

function createRelaxationVariable(model, weight, priority) {
    if (priority === 0 || priority === "required") {
        return null;
    }

    weight = weight || 1;
    priority = priority || 1;

    if (model.isMinimization === false) {
        weight = -weight;
    }

    return model.addVariable(weight, "r" + (model.relaxationIndex++), false, false, priority);
}

export class Variable {
    constructor(id, cost, index, priority) {
        this.id = id;
        this.cost = cost;
        this.index = index;
        this.value = 0;
        this.priority = priority;
    }
}

export class Numeral {
    constructor() {

    }
}

export class IntegerVariable extends Variable {
    constructor(id, cost, index, priority) {
        super(id, cost, index, priority);
    }

    // get isInteger() {
    //     return true;
    // }
}

export class SlackVariable extends Variable {
    constructor(id, index) {
        super(id, 0, index, 0);
    }

    // get isSlack() {
    //     return true;
    // }
}

//-------------------------------------------------------------------
//-------------------------------------------------------------------
export class Term {
    constructor(variable, coefficient) {
        this.variable = variable;
        this.coefficient = coefficient;
    }
}

//-------------------------------------------------------------------
//-------------------------------------------------------------------
export class Constraint {
    constructor(rhs, isUpperBound, index, model) {
        this.slack = new SlackVariable("s" + index, index);
        this.index = index;
        this.model = model;
        this.rhs = rhs;
        this.isUpperBound = isUpperBound;

        this.terms = [];
        this.termsByVarIndex = {};

        // Error variable in case the constraint is relaxed
        this.relaxation = null;
    }

    addTerm(coefficient, variable) {
        const varIndex = variable.index;
        let term = this.termsByVarIndex[varIndex];
        if (term === undefined) {
            // No term for given variable
            term = new Term(variable, coefficient);
            this.termsByVarIndex[varIndex] = term;
            this.terms.push(term);
            if (this.isUpperBound === true) {
                coefficient = -coefficient;
            }
            this.model.updateConstraintCoefficient(this, variable, coefficient);
        } else {
            // Term for given variable already exists
            // updating its coefficient
            const newCoefficient = term.coefficient + coefficient;
            this.setVariableCoefficient(newCoefficient, variable);
        }

        return this;
    }

    // eslint-disable-next-line no-unused-vars
    removeTerm(term) {
        // TODO
        return this;
    }

    setRightHandSide(newRhs) {
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

    setVariableCoefficient(newCoefficient, variable) {
        const varIndex = variable.index;
        if (varIndex === -1) {
            console.warn("[Constraint.setVariableCoefficient] Trying to change coefficient of inexistant variable.");
            return;
        }

        const term = this.termsByVarIndex[varIndex];
        if (term === undefined) {
            // No term for given variable
            this.addTerm(newCoefficient, variable);
        } else {
            // Term for given variable already exists
            // updating its coefficient if changed
            if (newCoefficient !== term.coefficient) {
                let difference = newCoefficient - term.coefficient;
                if (this.isUpperBound === true) {
                    difference = -difference;
                }

                term.coefficient = newCoefficient;
                this.model.updateConstraintCoefficient(this, variable, difference);
            }
        }

        return this;
    }

    relax(weight, priority) {
        this.relaxation = createRelaxationVariable(this.model, weight, priority);
        this._relax(this.relaxation);
    }

    _relax(relaxationVariable) {
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

//-------------------------------------------------------------------
//-------------------------------------------------------------------
export class Equality {
    constructor(constraintUpper, constraintLower) {
        this.upperBound = constraintUpper;
        this.lowerBound = constraintLower;
        this.model = constraintUpper.model;
        this.rhs = constraintUpper.rhs;
        this.relaxation = null;
    }

    // get isEquality() {
    //     return true;
    // }


    addTerm(coefficient, variable) {
        this.upperBound.addTerm(coefficient, variable);
        this.lowerBound.addTerm(coefficient, variable);
        return this;
    }

    removeTerm(term) {
        this.upperBound.removeTerm(term);
        this.lowerBound.removeTerm(term);
        return this;
    }

    setRightHandSide(rhs) {
        this.upperBound.setRightHandSide(rhs);
        this.lowerBound.setRightHandSide(rhs);
        this.rhs = rhs;
    }

    relax(weight, priority) {
        this.relaxation = createRelaxationVariable(this.model, weight, priority);
        this.upperBound.relaxation = this.relaxation;
        this.upperBound._relax(this.relaxation);
        this.lowerBound.relaxation = this.relaxation;
        this.lowerBound._relax(this.relaxation);
    }

}

