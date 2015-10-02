var primitives = require('./primitives');
var Numeral = primitives.Numeral;

//-------------------------------------------------------------------
//-------------------------------------------------------------------
function Constraint(type, rhs) {
    this.type = type;
    this.terms = [];

    if (rhs instanceof Numeral) {
        this.rhs = rhs;
    } else {
        this.rhs = new Numeral(rhs);
    }
}
module.exports = Constraint;

Constraint.prototype.addTerm = function (term) {
    this.terms.push(term);
};

// JSLP.equals(JSLP.plus(JSLP.Term(5, 'x1'), JSLP.Term(-3, 'x2')), JSLP.Numeral(7));
// JSLP.plus(JSLP.times(5, 'x1'), JSLP.times(-3, 'x2'))