/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/

var JSLP = require("../src/solver");
var Model = JSLP.Model;

//-------------------------------------------
// IMPOSSIBLE MODEL
//-------------------------------------------
var model1 = new Model(1e-8, "model 1").maximize();

var x1 = model1.addVariable(3, "x1");
var x2 = model1.addVariable(5, "x2");

var cst11 = model1.equal(8).addTerm(1, x1).addTerm(1, x2);
var cst12 = model1.equal(18).addTerm(3, x1).addTerm(2, x2);
var cst13 = model1.equal(32).addTerm(5, x1).addTerm(4, x2);
var cst14 = model1.equal(4).addTerm(4, x1).addTerm(-1, x2);
var cst15 = model1.greaterThan(6).addTerm(1, x2);

//-------------------------------------------
// SOLVING ONCE
//-------------------------------------------
var solution1 = model1.solve();
console.log("");
console.log("* Model 1 Solved *");
console.log("Is solution feasible?", solution1.feasible);

//-------------------------------------------
// RELAXING CONSTRAINTS
//-------------------------------------------
var weight11 = 1;
var weight12 = 2;
var weight13 = 5;
var weight14 = 2;
cst11.relax(weight11);
cst12.relax(weight12);
cst13.relax(weight13);
cst14.relax(weight14);

//-------------------------------------------
// SOLVING RELAXED MODEL
//-------------------------------------------
solution1 = model1.solve();
console.log("");
console.log("* Model 1 (Relaxed) Solved *");
console.log("Feasible =", solution1.feasible);
console.log("Evaluation =", solution1.evaluation);
console.log("x1 =", x1.value);
console.log("x2 =", x2.value);
console.log("cst11 error =", cst11.relaxation.value);
console.log("cst12 error =", cst12.relaxation.value);
console.log("cst13 error =", cst13.relaxation.value);
console.log("cst14 error =", cst14.relaxation.value);

// Expected
// Feasible = true
// Evaluation = 24.8
// x1 = 1.6
// x2 = 6
// e1 = 0.4
// e2 = 1.2
// e3 = 0
// e4 = 3.6


//-------------------------------------------
// IMPOSSIBLE MODEL
//-------------------------------------------
var model2 = new Model(1e-8, "model 2");

var x1 = model2.addVariable(0, "x1");
var x2 = model2.addVariable(0, "x2");

// Strong priority constraints
var cst21 = model2.smallerThan(6).addTerm(2, x1).addTerm(1, x2);

// Medium priority constraints
var cst22 = model2.greaterThan(2).addTerm(1, x2);

// Weak priority constraints
var cst23 = model2.greaterThan(3).addTerm(3, x1).addTerm(-4, x2);
var cst24 = model2.smallerThan(10).addTerm(5, x1).addTerm(2, x2);
var cst25 = model2.smallerThan(-5).addTerm(1, x1).addTerm(-3, x2);

//-------------------------------------------
// SOLVING ONCE
//-------------------------------------------
var solution2 = model2.solve();
console.log("");
console.log("* Model 2 Solved *");
console.log("Is solution feasible?", solution2.feasible);

//-------------------------------------------
// RELAXING CONSTRAINTS
//-------------------------------------------
var weight21 = 1;
var weight22 = 1;
var weight23 = 10;
var weight24 = 40;
var weight25 = 20;
cst21.relax(weight21, 'strong');
cst22.relax(weight22, 'medium');
cst23.relax(weight23, 'weak');
cst24.relax(weight24, 'weak');
cst25.relax(weight25, 'weak');

//-------------------------------------------
// SOLVING RELAXED MODEL
//-------------------------------------------
solution2 = model2.solve();
console.log("");
console.log("* Model 2 (Relaxed) Solved*");
console.log("Feasible =", solution2.feasible);
console.log("Evaluation =", solution2.evaluation);
console.log("x1 =", x1.value);
console.log("x2 =", x2.value);
console.log("cst21 error =", cst21.relaxation.value);
console.log("cst22 error =", cst22.relaxation.value);
console.log("cst23 error =", cst23.relaxation.value);
console.log("cst24 error =", cst24.relaxation.value);
console.log("cst25 error =", cst25.relaxation.value);

