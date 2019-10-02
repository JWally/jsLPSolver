/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/

var solver = require("../../src/solver");
var model = require("../test-sanity/LargeFarmMIP.json");

var result = solver.Solve(model, 1e-9, false);
console.log(result);