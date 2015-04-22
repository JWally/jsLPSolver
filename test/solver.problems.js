/*global describe*/
/*global require*/
/*global it*/

var assert = require("assert"),
    problems = require("./problems.json");


describe("The Solve method takes a problem and solves it",
    function () {
        var solver = require("../src/solver");

        problems.forEach(function (d) {
            it("should be able to solve the " + d.name,
                function () {
                    assert.deepEqual(d.expects, solver.Solve(d));
                });
        });
    });
