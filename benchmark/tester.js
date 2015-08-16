var solver = require("../src/solver"),
    problem = require("../test/problems.json")[7];
    helpers = solver._helpers;

delete problem.expects;

console.log(problem);

var a = solver.Solve(problem);
console.log("\n\n");
console.log(a);
