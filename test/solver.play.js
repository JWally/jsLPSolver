/*global describe*/
/*global require*/
/*global it*/
/*global console*/


var problems = require("./problems.json"),
    solver = require("../src/solver");
    
console.log("------------------------");
console.log("-REVERSE-");
console.log("------------------------");
for (var i = problems.length - 1; i > -1; i--) {
    var date_0 = new Date().getTime();
    solver.Solve(problems[i]);
    var a = new Date().getTime() - date_0;
    console.log(problems[i].name, "--------->", a);
}
    

console.log("------------------------");
console.log("-FORWARD-");
console.log("------------------------");
for (var i = 0; i < problems.length; i++) {
    var date_0 = new Date().getTime();
    solver.Solve(problems[i]);
    var a = new Date().getTime() - date_0;
    console.log(problems[i].name, "--------->", a);
}


