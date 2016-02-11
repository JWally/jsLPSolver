/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/

var JSLP = require("../src/solver");
var Model = JSLP.Model;
var Term = JSLP.Term;

//-------------------------------------------
// QUADRATIC OPTIMISATION MODEL
//-------------------------------------------
var model1 = new Model(1e-8, "model 1").maximize();

var x1 = model1.addVariable(0, "x1");
var x2 = model1.addVariable(0, "x2");

var cst1 = model1.greaterThan(3).addTerm(1, x1).addTerm(1, x2);
var cst2 = model1.smallerThan(7).addTerm(1, x1).addTerm(1, x2);
var cst3 = model1.greaterThan(1).addTerm(1, x1);
var cst4 = model1.greaterThan(1).addTerm(1, x2);

// var cst5 = model1.equal(5).addTerm(1, x1).addTerm(1, x2);
// var cst6 = model1.equal(2).addTerm(1, x1);

model1.setQuadraticCost(x1, [1, x1], -8);
model1.setQuadraticCost(x2, [1, x2], -8);

var solution = model1.solve();
model1.log("model1");


//-------------------------------------------
// QUADRATIC OPTIMISATION MODEL
//-------------------------------------------
// var model2 = new Model(1e-8, "model 2").minimize();

// var x1 = model2.addVariable(0, "x1");
// var x2 = model2.addVariable(0, "x2");

// var cst3 = model2.smallerThan(6).addTerm(2, x1).addTerm( 3, x2);
// var cst4 = model2.smallerThan(1).addTerm(1, x1).addTerm(-1, x2);

// model2.setQuadraticCost(x1, [1, x1], -6);
// model2.setQuadraticCost(x2, [1, x2], -4);

// console.log('QP', model2.solve());

//-------------------------------------------
// QUADRATIC OPTIMISATION MODEL
//-------------------------------------------
// var model3 = new Model(1e-8, "model 3").minimize();

// var x1 = model3.addVariable(0, "x1");
// var x2 = model3.addVariable(0, "x2");
// var l1 = model3.addVariable(0, "l1", false, true);

// var cst1 = model3.equal(6).addTerm(2, x1).addTerm(-1, l1);
// var cst2 = model3.equal(6).addTerm(2, x2).addTerm(-1, l1);

// var cst3 = model3.smallerThan(3).addTerm(1, x1).addTerm(1, x2);

// console.log('QP', model3.solve());

//-------------------------------------------
// QUADRATIC OPTIMISATION MODEL
//-------------------------------------------
// var model4 = new Model(1e-8, "model 4").maximize();

// var x1 = model4.addVariable(0, "x1");
// var x2 = model4.addVariable(0, "x2");

// var cst1 = model4.equal(0).addTerm(5, l1).addTerm(-1, l2).addTerm(-3, u1).addTerm(-4, u2).addTerm(1, u3);
// var cst2 = model4.equal(0).addTerm(1, l1).addTerm( 7, l2).addTerm(-1, u1).addTerm(-3, u2).addTerm(1, u4);
// var cst3 = model4.equal(0).addTerm( 5, x1).addTerm(1, x2).addTerm(-1, u5);
// var cst4 = model4.equal(0).addTerm(-1, x1).addTerm(7, x2).addTerm(-1, u5);

// var cst5 = model4.smallerThan(3).addTerm(3, x1).addTerm(1, x2);
// var cst6 = model4.smallerThan(6).addTerm(4, x1).addTerm(3, x2);

// var cst6 = model4.smallerThan(0.5).addTerm(1, l1);

// var cst7 = model4.equal(1).addTerm(1, l1).addTerm(1, l2);

// var cst8 = model4.equal(0).addTerm(1, l1).addTerm(1, l2);
// var cst9 = model4.equal(1).addTerm(1, l1).addTerm(1, l2);

// var cst6 = model4.equal(0).addTerm(1, l1);

// console.log("QP", model4.solve());





















