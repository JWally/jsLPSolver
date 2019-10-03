/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/

var solver = require("../../src/solver");
var models = [];

models.push(require("../test-wip/LargeFarmMIP.json"));
models.push(require("../test-wip/StockCuttingProblem.json"));
models.push(require("../test-wip/ChenhuaWANG22_1.json"));
models.push(require("../test-wip/ChenhuaWANG22_2.json"));

models.forEach(function(model){

var solution = solver.Solve(model, 1e-9, true);

    // Otherwise; give the user the bare
    // minimum of info necessary to carry on

    var store = {};

    // 1.) Add in feasibility to store;
    store.feasible = solution.feasible;

    // 2.) Add in the objective value
    store.result = solution.evaluation;

    store.bounded = solution.bounded;
    
    if(solution._tableau.__isIntegral){
        store.isIntegral = true;
    }

    // 3.) Load all of the variable values
    Object.keys(solution.solutionSet)
    .map(function (d) {
        store[d] = solution.solutionSet[d];
    });
    
    store.messages = solution._tableau.model.messages;

    console.log(store);
    
});
