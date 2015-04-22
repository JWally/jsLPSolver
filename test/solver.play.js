/*global describe*/
/*global require*/
/*global it*/
/*global console*/


var problems = require("./problems.json"),
    fs = require("fs"),
    solver = require("../src/solver");


console.log("------------------------");
console.log("-FORWARD-");
console.log("------------------------");

for (var i = 0; i < problems.length; i++) {

    var j = problems[i];

    var date_0 = new Date().getTime();
    solver.Solve(j);
    var a = new Date().getTime() - date_0;
    console.log(problems[i].name, i, "--------->", a);
}


/*

console.log("------------------------");
console.log("-REVERSE-");
console.log("------------------------");

    var i = 5,
        j = problems[i];


    var date_0 = new Date().getTime();    
    solver.Solve(j);
    var a = new Date().getTime() - date_0;
    console.log(problems[i].name, i, "--------->", a);



*/
