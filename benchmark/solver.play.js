/*global describe*/
/*global require*/
/*global it*/
/*global console*/
/*global process*/


var problems = require("../test/all_problems.json"),
    fs = require("fs"),
    solver = require("../src/solver");


console.log("------------------------");
console.log("-FORWARD-");
console.log("------------------------");

for (var i = 0; i < problems.length; i++) {

    var j = problems[i];

    var date_0 = process.hrtime();
    var d = solver.Solve(j);
    var a = process.hrtime(date_0);
    console.log(problems[i].name, "--------->", a[0] + "s", a[1].toExponential(),"|||", d.result);
}