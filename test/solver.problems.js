/*global describe*/
/*global require*/
/*global it*/

var assert = require("assert"),
    problems = require("./problems.json");

problems = problems.concat(require("./all_problems.json"));

problems.splice(-1,1);

// For testing, Function to sort an object
function sortObject(theObj) {
    var finalObj = {};

    Object.keys(theObj).sort()
        .forEach(function (d) {
            finalObj[d] = theObj[d];
        });

    return finalObj;
}


describe("The Solve method takes a problem and solves it",
    function () {
        var solver = require("../src/solver");

        problems.forEach(function (d) {
            it("should be able to solve the " + d.name,
                function () {
                    var a = d.expects,
                        b = solver.Solve(d);

                    assert.deepEqual(
                        sortObject(b),
                        sortObject(a)

                    );
                });
        });
    });
