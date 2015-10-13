var JSLP = require("../src/solver");

var Model = JSLP.Model;
var Term = JSLP.Term;

var models = [];

//-------------------------------------------
// MODEL 1
//-------------------------------------------
var model1 = new Model(1e-8, 'model 1').maximize();

var x1 = model1.addVariable(-4, 'x1');
var x2 = model1.addVariable(-2, 'x2');
var x3 = model1.addVariable( 1, 'x3');

var cst1 = model1.smallerThan(-3).addTerm(-1, x1).addTerm(-1, x2).addTerm( 2, x3);
var cst2 = model1.smallerThan(-4).addTerm(-4, x1).addTerm(-2, x2).addTerm( 1, x3);
var cst2 = model1.smallerThan( 2).addTerm( 1, x1).addTerm( 1, x2).addTerm(-4, x3);

models.push(model1);

//-------------------------------------------
// MODEL 2
//-------------------------------------------
var model2 = new Model(1e-8, 'model 2').minimize();

var x1 = model2.addVariable(3, 'x1');
var x2 = model2.addVariable(2, 'x2');

var cst1 = model2.greaterThan(3).addTerm(1, x1).addTerm(1, x2);
var cst2 = model2.greaterThan(4).addTerm(2, x1).addTerm(1, x2);

models.push(model2);

//-------------------------------------------
// WARM UP
//-------------------------------------------
for (var m = 0; m < models.length; m++) {
    JSLP.Solve(models[m], 1e-8, true);
}

//-------------------------------------------
// TESTING
//-------------------------------------------
for (var m = 0; m < models.length; m++) {
    model = models[m];

    // if (model.name === 'model1') {
    //     continue;
    // }

    console.log('>>>>> Solving', model.name, '<<<<<');
    var t = process.hrtime();
    var solution = JSLP.Solve(model, 1e-8, true);
    var d = process.hrtime(t);
    console.log('Solution', solution);
    console.log('Solved in', d[0] + d[1] / 1e9, 'seconds');
}
