/*global describe*/
/*global require*/
/*global it*/
/*global console*/
/*global process*/


var problems = require("../test/all_problems.json"),
    fs = require("fs"),
    solver = require("../src/solver");

// var bigMILP = require('./test_suite/SPY_SPY_SPY_20170616.json');

// bigMILP.name = 'SPY_SPY_SPY_20170616';
// delete bigMILP.ints;
// problems.push(bigMILP);


console.log("------------------------");
console.log("-FORWARD-");
console.log("------------------------");

var log = {};


for (var i = 0; i < problems.length; i++) {

    var k = 0,
        j = problems[i];


        log[j.name] = {};

        for(var constraint in j.constraints){
            if(j.constraints[constraint].max){
                log[j.name].constraints = log[j.name].constraints  || 0;
                log[j.name].constraints++;
            }

            if(j.constraints[constraint].min){
                log[j.name].constraints = log[j.name].constraints  || 0;
                log[j.name].constraints++;
            }
        }

        log[j.name].variables = Object.keys(j.variables).length;

        if(j.ints){
            log[j.name].ints = Object.keys(j.ints).length;
        }

}

var totalTime = 0;

// var nProblems = problems.length;
// var currentProblem = 0;

// function RunNextTest() {
//     var problemExecuted = false;
//     var problem = problems[currentProblem];
//     // if (problem.name === 'Monster Problem') {
//     if (problem.name !== 'monster_II') {
//         var date_0 = process.hrtime();
//         var d = solver.Solve(problem);
//         var a = process.hrtime(date_0);

//         log[problem.name].result = d.result;
//         log[problem.name].time =  a[0] + a[1] / 1e9;
//         log[problem.name].iter = d.iter ? d.iter : undefined;
//         log[problem.name].solution = d;

//         totalTime += a[0] + a[1] / 1e9;
//         problemExecuted = true;
//     }

//     currentProblem += 1;
//     if (currentProblem < nProblems) {
//         if (problemExecuted === true) {
//             setTimeout(RunNextTest, 2000);
//         } else {
//             RunNextTest();
//         }
//     } else {
//         // This is the end
//         console.log(log);
//         console.log('All Solved in', totalTime, 'seconds');
//     }
// }

// RunNextTest();

for(i = 0; i < problems.length; i++) {
// for(i = problems.length - 1; i >= 0; i--){
    problem = problems[i];

    // if (problem.name === 'monster_II') {
    // if (problem.name !== 'SPY_SPY_SPY_20170616') {
    // if (problem.name !== 'monster_II') {
    // if (problem.name !== 'Monster Problem') {
    // if (problem.name === 'monster_II' || problem.name === 'Monster Problem') {
    // if (problem.name !== 'Berlin Air Lift Problem') {
    // if (problem.name !== 'Integer Berlin Air Lift Problem') {
    // if (problem.name !== 'Infeasible Berlin Air Lift Problem') {
    // if (problem.name !== 'Generic Business Problem 2') {
    // if (problem.name !== 'Wiki 1') {
    // if (problem.name !== 'Artificial') {
    // if (problem.name !== 'Coffee Problem') {
    // if (problem.name !== 'Shift Work Problem') {
    // if (problem.name !== 'Degenerate Max') {
    // if (problem.name !== 'Degenerate Min') {
    if (problem.name !== 'Integer Wood Problem') {
    // if (problem.name !== 'Chevalier 1') {
    // if (problem.name !== 'Integer Chocolate Problem') {
    // if (problem.name !== 'Integer Clothing Shop Problem II') {
        continue;
    }
console.log('>>>>> Solving', problem.name, '<<<<<');
    var date_0 = process.hrtime();
    var d = solver.Solve(problem);
    var a = process.hrtime(date_0);

    log[problem.name].objectiveValue = d.objectiveValue;
    log[problem.name].time =  a[0] + a[1] / 1e9;
    log[problem.name].iter = d.iter ? d.iter : undefined;
    log[problem.name].solutionSet = d.solutionSet;
    log[problem.name].feasible = d.feasible;
// console.log('Result', d.result);
// console.log('>>>>> Solved in', (a[0] + a[1] / 1e9) * 1000, 'ms <<<<<');
// console.log('');

    totalTime += a[0] + a[1] / 1e9;
}

console.log(log);
console.log('All Solved in', totalTime, 'seconds');