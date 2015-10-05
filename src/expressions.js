
//-------------------------------------------------------------------
//-------------------------------------------------------------------
function Numeral(value) {
    if (this instanceof Numeral) {
        this.value = value;
    } else {
        if (value instanceof Numeral) {
            return value;
        } else {
            return new Numeral(value);
        }
    }
}

Numeral.prototype.set = function (value) {
    if (value !== this.value) {
        this.value = value;
        this._dirty = true;
        // TODO: set constraint and model as dirty
    }
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
function Variable(name, index) {
    this.name = name;
    this.index = index;
    this.value = 0;
}

//-------------------------------------------------------------------
//-------------------------------------------------------------------
function Term(coefficient, variable) {
    this.coefficient = Numeral(coefficient);
    this.variable = variable;
}

Term.prototype.setCoefficient = function (coefficient) {
    this.coefficient = Numeral(coefficient);
    this._dirty = true;
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
function Constraint(rhs, isUpperBound, isLowerBound) {
    this.rhs = Numeral(rhs);
    this.terms = [];

    this.isUpperBound = isUpperBound;
    this.isLowerBound = isLowerBound;
}

Constraint.prototype.addTerm = function (term) {
    this.terms.push(term);
    return this;
};

Constraint.prototype.removeTerm = function (term) {
    // TODO
    return this;
};


module.exports = {
    Variable: Variable,
    Numeral: Numeral,
    Term: Term,
    Constraint: Constraint
};

// var model = new JSPL.Model().maximize();

// var var1 = model.createVariable('x1', -4);
// var var2 = model.createVariable('x2', -2);
// var var3 = model.createVariable('x3',  1);

// var cst1 = model.smallerThan(-3).addTerm(Term(-1, var1)).addTerm(Term(-1, var2)).addTerm(Term( 2, var3));
// var cst2 = model.smallerThan(-4).addTerm(Term(-4, var1)).addTerm(Term(-2, var2)).addTerm(Term( 1, var3));
// var cst2 = model.smallerThan( 2).addTerm(Term( 1, var1)).addTerm(Term( 1, var2)).addTerm(Term(-4, var3));


