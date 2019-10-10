/*global describe*/
/*global require*/
/*global it*/
/*global console*/
/*global process*/

var assert = require("assert");
var fs = require("fs");

// var problems = [];

var path_of = process.argv[2];



var ary = fs.readdirSync("test/" + path_of + "/")
            .filter(function(file){return /\.json$/.test(file);});


var problems = ary.map(function(x){
    var tmp = fs.readFileSync("test/" + path_of + "/" + x, "utf8");
    console.log("opening - ",x);
    return JSON.parse(tmp);
});


function assertSolution(model, solutionA, solutionB) {

    // If the problem is feasible but the solution isn't then failure
    // Else if they are both unfeasible then success
    if (solutionA.feasible !== solutionB.feasible){
        return assert.deepEqual({ feasible: solutionA.feasible }, { feasible: solutionB.feasible });
    } else if (!solutionA.feasible) {
        return assert.deepEqual({ feasible: solutionA.feasible }, { feasible: solutionB.feasible });
    }

    var solutionAIsBounded = solutionA.bounded === undefined ? true : solutionA.bounded;
    var solutionBIsBounded = solutionB.bounded === undefined ? true : solutionB.bounded;
    if (solutionAIsBounded !== solutionBIsBounded){
        return assert.deepEqual({ bounded: solutionAIsBounded }, { bounded: solutionBIsBounded });
    } else if (!solutionAIsBounded) {
        return assert.deepEqual({ bounded: solutionAIsBounded }, { bounded: solutionBIsBounded });
    }

    // If the expected evaluation of the objective function is different from the actual evaluation then failure
    if (solutionA.result.toFixed(6) !== solutionB.result.toFixed(6)){
        return assert.deepEqual(
            { ObjectiveFunctionEvaluation: solutionA.result.toFixed(6) },
            { ObjectiveFunctionEvaluation: solutionB.result.toFixed(6) }
        );
    }

    // More accurate way to compute the adequate precision ?
    var precision = 1e-6;
    var tableau = model.tableau;

    // Check if all the constraints are respected
    for (var cstIndex = 0; cstIndex < model.constraints.length; cstIndex += 1) {
        var constraint = model.constraints[cstIndex];

        var lhs = 0;
        for (var termIndex = 0; termIndex < constraint.terms.length; termIndex += 1) {
            var term = constraint.terms[termIndex];

            lhs += term.variable.value * term.coefficient;
        }

        if (constraint.isUpperBound && constraint.rhs - lhs <= -precision) {
            return assert.deepEqual({ upperBoundConstraint: lhs }, { upperBoundConstraint: constraint.rhs });
        } else if (!constraint.isUpperBound && constraint.rhs - lhs >= precision) {
            return assert.deepEqual({ lowerBoundConstraint: lhs }, { lowerBoundConstraint: constraint.rhs });
        }
    }

    return assert.deepEqual(true, true);
}

// Build out our test suite
describe("The Solve method takes a problem and solves it",
    function () {
        var solver = require("../src/solver");
        // Iterate over each problem in the suite
        problems.forEach(function (jsonModel) {
            // Generic "Should" Statement
            // (should come up with a better test scheme and description...)
            it("should be able to solve the " + jsonModel.name,
                function () {
                    // Look to see if the JSON Model's "expects"
                    // has a "_timeout". If so, set it and delete it (to not
                    // interfere with any test expectations)
                    if(jsonModel.expects._timeout){
                        this.timeout(jsonModel.expects._timeout);
                        delete jsonModel.expects._timeout;
                    }


                    // Each problem has its correct answer attached to its
                    // JSON as an "expects" object
                    var expectedResult = jsonModel.expects,
                        obtainedResult = solver.Solve(jsonModel);

                    var model = solver.lastSolvedModel;

                    // Compare what we expect the problem to be
                    // to what solver comes up with
                    assertSolution(
                        model,
                        obtainedResult,
                        expectedResult
                    );
                });
        });
    });
