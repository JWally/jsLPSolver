
//-------------------------------------------------------------------
//-------------------------------------------------------------------
function Numeral(value) {
    this.value = value;
}

function Variable(name, index) {
    this.name = name;
    this.index = index;
    this.value = 0;
}

function Term(coefficient, variable) {
    this.coefficient = coefficient;
    this.variable = variable;
}

module.exports = {
    Variable: Variable,
    Numeral: Numeral,
    Term: Term
};