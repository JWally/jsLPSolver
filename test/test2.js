/*global describe*/
/*global require*/
/*global it*/
/*global console*/
/*global process*/


// var problems = [],
var problems = require("./problems.json"),
fs = require("fs"),
solver = require("../src/main.js");

// problems.push(require("../benchmark/test_suite/SPY_SPY_SPY_20150918.json"));
problems.push(require("../benchmark/test_suite/SPY_SPY_SPY_20170616.json"));
console.log(problems.length);


console.log("------------------------");
console.log("-FORWARD-");
console.log("------------------------");

var log = {};


for (var i = 0; i < problems.length; i++) {

    var k = 0,
    j = problems[i];


    log[j.name] = {};

    for(var constraint in j.constraints) {
        if (j.constraints[constraint].max) {
            log[j.name].constraints = log[j.name].constraints  || 0;
            log[j.name].constraints++;
        }

        if (j.constraints[constraint].min) {
            log[j.name].constraints = log[j.name].constraints  || 0;
            log[j.name].constraints++;
        }
    }

    log[j.name].variables = Object.keys(j.variables).length;

    if (j.ints) {
        log[j.name].ints = Object.keys(j.ints).length;
    }

}



for( i = 0; i < problems.length; i++) {

    j = problems[i];
    if (!j.ints) {
        continue;
    }
    // if (j.name !== 'Integer Chocolate Problem') {
    //     continue;
    // }
    // if (j.name !== 'Integer Wood Shop Problem') {
    //     continue;
    // }
    // if (j.name !== "monster_II") {
    //     continue;
    // }


    var date_0 = process.hrtime();
    var d = solver.Solve(j, 1e-8, true);
    var a = process.hrtime(date_0);

    log[j.name] = d;
    log[j.name].time =  a[0] + a[1] / 1e9;

    console.log("####", j.name, "####");
    console.log("in", a[0] + a[1] / 1e9, "s");
    console.log(d.iter, "iterations");
    console.log("feasible?", d.feasible);
    console.log(d.evaluation);
    console.log(d.solutionSet);
}

// console.log(log);
