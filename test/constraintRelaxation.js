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
var model = new Model(1e-8, "model 1").maximize();

var x1 = model.addVariable(3, "x1");
var x2 = model.addVariable(5, "x2");

var cst1 = model.equal(8).addTerm(1, x1).addTerm(1, x2);
var cst2 = model.equal(18).addTerm(3, x1).addTerm(2, x2);
var cst3 = model.equal(32).addTerm(5, x1).addTerm(4, x2);
var cst4 = model.equal(4).addTerm(4, x1).addTerm(-1, x2);
var cst5 = model.greaterThan(6).addTerm(1, x2);

//-------------------------------------------
// SOLVING ONCE
//-------------------------------------------
var solution = model.solve();
console.log("Is solution feasible?", solution.feasible);

//-------------------------------------------
// RELAXING CONSTRAINTS
//-------------------------------------------
cst1.relax(1);
cst2.relax(1);
cst3.relax(1);
cst4.relax(1);

//-------------------------------------------
// SOLVING RELAXED MODEL
//-------------------------------------------
var solution = model.solve();
console.log("Constraints relaxed");
console.log("Is solution feasible?", solution.feasible);
console.log("Solution", solution);


