/*global describe*/
/*global require*/
/*global it*/

var assert = require("assert"),
    problems = require("./problems.json");


describe("The Solve method takes a problem and solves it",
    function () {
        var solver = require("../src/solver");

        // Quick Run through All of Our problems to ensure they work still
        describe("Generic Solver", function () {
            // Coffee Problem
            it("should be able to solve the Coffee Problem",
                function () {
                    assert.deepEqual(
                        problems[0].expects,
                        solver.Solve(problems[0])
                    );
                }
            );

            // Computer Supply Problem
            it("should be able to solve the Computer Supply Problem",
                function () {
                    assert.deepEqual(
                        problems[1].expects,
                        solver.Solve(problems[1])
                    );
                }
            );

            // Chocolate Production
            it("should be able to solve the Chocolate Production Problem",
                function () {
                    assert.deepEqual(
                        problems[3].expects,
                        solver.Solve(problems[3])
                    );
                }
            );

        });

        describe("Mixed Integer Linear Program Solver", function () {
            it("Should be able to handle the schedueling problem",
                function () {
                    // Get the problem
                    var problem = problems[problems.length - 1];

                    assert.deepEqual(
                        problem.expects,
                        solver.Solve(problem)
                    );
                }
            );

        });
    }
);
