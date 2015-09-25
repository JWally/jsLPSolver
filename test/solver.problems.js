/*global describe*/
/*global require*/
/*global it*/

var assert = require("assert"),
    problems = require("./problems.json");

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

                    assert.deepEqual(sortObject(a), sortObject(
                        b));
                });
        });
    });
