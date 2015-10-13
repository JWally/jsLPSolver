/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/

var JSLP = require("../src/solver");
var Model = JSLP.Model;
var Tableau = JSLP.Tableau;
var Term = JSLP.Term;


//-------------------------------------------
// TESTING DYNAMIC RESOLUTION
// ON A 2 DIMENSIONAL PROBLEM
//-------------------------------------------

//-------------------------------------------
// INITIAL MODEL
//-------------------------------------------
var model2d = new Model(1e-8, "dynamic model 2d").minimize();

var x1 = model2d.addVariable(3, "x1");
var x2 = model2d.addVariable(2, "x2");

var cst1 = model2d.greaterThan(3).addTerm(1, x1).addTerm(1, x2);
var cst2 = model2d.greaterThan(4).addTerm(2, x1).addTerm(1, x2);

//-------------------------------------------
// INITIAL SOLVING
//-------------------------------------------
model2d.solve();
model2d.log("Solution 1");

//-------------------------------------------
// CHANGING RHS
//-------------------------------------------
cst1.setRightHandSide(2.5);
model2d.solve();
model2d.log("Solution 2");

//-------------------------------------------
// CHANGING VARIABLE COEFFICIENT
//-------------------------------------------
cst1.setVariableCoefficient(1.25, x1);
model2d.solve();
model2d.log("Solution 3");

//-------------------------------------------
// CHANGING OBJECTIVE COEFFICIENT
//-------------------------------------------
model2d.setCost(1, x2);
model2d.solve();
model2d.log("Solution 4");

//-------------------------------------------
// ADDING A CONSTRAINT
//-------------------------------------------
var cst3 = model2d.smallerThan(0).addTerm(-3, x1).addTerm(1, x2);
model2d.solve();
model2d.log("Solution 5");

//-------------------------------------------
// RESETTING PARAMETERS TO INITIAL VALUES
//-------------------------------------------
cst1.setRightHandSide(3);
cst1.setVariableCoefficient(1, x1);
model2d.setCost(2, x2);
model2d.removeConstraint(cst3);
model2d.solve();
model2d.log("Solution 6");

//-------------------------------------------
// TESTING DYNAMIC RESOLUTION
// ON A 4 DIMENSIONAL PROBLEM
//-------------------------------------------
var model4d = new Model(1e-8, "dynamic model 4d").maximize();

var coat = model4d.addVariable(50, "coat");
var pants = model4d.addVariable(40, "pants");
var hat = model4d.addVariable(10, "hat");
var socks = model4d.addVariable(1, "socks");

var yard = model4d.smallerThan(150).addTerm(3, coat).addTerm(5, pants).addTerm(1, hat).addTerm(0.5, socks);
var hours = model4d.smallerThan(200).addTerm(10, coat).addTerm(4, pants).addTerm(12, hat).addTerm(0.5, socks);

//-------------------------------------------
// INITIAL SOLVING
//-------------------------------------------
model4d.solve();
model4d.log("Solution 1");

//-------------------------------------------
// CHANGING RHS
//-------------------------------------------
yard.setRightHandSide(200);
model4d.solve();
model4d.log("Solution 2");

//-------------------------------------------
// CHANGING VARIABLE COEFFICIENT
//-------------------------------------------
yard.setVariableCoefficient(7, pants);
model4d.solve();
model4d.log("Solution 3");

//-------------------------------------------
// CHANGING OBJECTIVE COEFFICIENT
//-------------------------------------------
model4d.setCost(10, coat);
model4d.solve();
model4d.log("Solution 4");

//-------------------------------------------
// ADDING A CONSTRAINT
//-------------------------------------------
var cost = model4d.smallerThan(1000).addTerm(60, coat).addTerm(70, pants).addTerm(8, hat).addTerm(2, socks);
model4d.solve();
model4d.log("Solution 5");

//-------------------------------------------
// REMOVING A VARIABLE
//-------------------------------------------
model4d.removeVariable(pants);
model4d.solve();
model4d.log("Solution 6");

//-------------------------------------------
// RESETTING PARAMETERS TO INITIAL VALUES
//-------------------------------------------
// Resetting right hand side
yard.setRightHandSide(150);

// Reintroducing the pants variable
var pants = model4d.addVariable(40, "pants");
yard.addTerm(5, pants);
hours.addTerm(4, pants);

// Resetting objective coefficient of the coat to original value
model4d.setCost(50, coat);

// Removing extra cost constraint
model4d.removeConstraint(cost);

model4d.solve();
model4d.log("Solution 7");
