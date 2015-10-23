/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/

//-------------------------------------------------------------------
//-------------------------------------------------------------------
function Variable(id, cost, index) {
    this.id = id;
    this.cost = cost;
    this.index = index;
    this.value = 0;
}

//-------------------------------------------------------------------
//-------------------------------------------------------------------
function Term(variable, coefficient) {
    this.variable = variable;
    this.coefficient = coefficient;
}

//-------------------------------------------------------------------
//-------------------------------------------------------------------
function Constraint(rhs, isUpperBound, index, model) {
    this.index = index;
    this.model = model;
    this.rhs = rhs;
    this.isUpperBound = isUpperBound;

    this.terms = [];
    this.termsByVarIndex = {};
}

Constraint.prototype.addTerm = function (coefficient, variable) {
    var varIndex = variable.index;
    var term = this.termsByVarIndex[varIndex];
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
        var newCoefficient = term.coefficient + coefficient;
        this.setVariableCoefficient(newCoefficient, variable);
    }

    return this;
};

Constraint.prototype.removeTerm = function (term) {
    // TODO
    return this;
};

Constraint.prototype.setRightHandSide = function (newRhs) {
    if (newRhs !== this.rhs) {
        var difference = newRhs - this.rhs;
        if (this.isUpperBound === true) {
            difference = -difference;
        }

        this.rhs = newRhs;
        this.model.updateRightHandSide(this, difference);
    }

    return this;
};

Constraint.prototype.setVariableCoefficient = function (newCoefficient, variable) {
    var varIndex = variable.index;
    if (varIndex === -1) {
        console.warn("[Constraint.setVariableCoefficient] Trying to change coefficient of inexistant variable.");
        return;
    }

    var term = this.termsByVarIndex[varIndex];
    if (term === undefined) {
        // No term for given variable
        this.addTerm(newCoefficient, variable);
    } else {
        // Term for given variable already exists
        // updating its coefficient if changed
        if (newCoefficient !== term.coefficient) {
            var difference = newCoefficient - term.coefficient;
            if (this.isUpperBound === true) {
                difference = -difference;
            }

            term.coefficient = newCoefficient;
            this.model.updateConstraintCoefficient(this, variable, difference);
        }
    }

    return this;
};

var errorVarIdx = 1;
Constraint.prototype.relax = function (weight) {
    if (this.model.isMinimization === false) {
        weight = -weight;
    }

    var error = this.model.addVariable(weight, "e" + (errorVarIdx++).toString());
    this._relax(error);
};

Constraint.prototype._relax = function (error) {
    if (this.isUpperBound) {
        this.setVariableCoefficient(-1, error);
    } else {
        this.setVariableCoefficient(1, error);
    }
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
function Equality(constraintUpper, constraintLower) {
    this.upperBound = constraintUpper;
    this.lowerBound = constraintLower;
    this.model = constraintUpper.model;
    this.rhs = constraintUpper.rhs;
}

Equality.prototype.addTerm = function (coefficient, variable) {
    this.upperBound.addTerm(coefficient, variable);
    this.lowerBound.addTerm(coefficient, variable);
    return this;
};

Equality.prototype.removeTerm = function (term) {
    this.upperBound.removeTerm(term);
    this.lowerBound.removeTerm(term);
    return this;
};

Equality.prototype.setRightHandSide = function (rhs) {
    this.upperBound.setRightHandSide(rhs);
    this.lowerBound.setRightHandSide(rhs);
    this.rhs = rhs;
};

Equality.prototype.relax = function (weight) {
    if (this.model.isMinimization === false) {
        weight = -weight;
    }

    var error = this.model.addVariable(weight, "e" + (errorVarIdx++).toString());
    this.upperBound._relax(error);
    this.lowerBound._relax(error);
};


module.exports = {
    Constraint: Constraint,
    Variable: Variable,
    Equality: Equality,
    Term: Term
};
