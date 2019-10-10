/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/
var solver = require("../../src/solver");
var model = require("../test-wip/SPY_SPY_SPY_20160617.json");

var a = solver.Solve(model); 
console.log(a);

