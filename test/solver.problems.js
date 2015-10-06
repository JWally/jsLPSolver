/*global describe*/
/*global require*/
/*global it*/

var assert = require("assert"),
    problems = require("./problems.json");

// Kick off the second "Monster" problem
//problems.splice(-1,1);

// For testing, Function to sort an object
function sortObject(theObj, round) {
    var finalObj = {};

    Object.keys(theObj).sort()
        .forEach(function (d) {
            // Also, its decided that in this function
            // we want to be able, for testing purposes
            // to be able to round an object to 'n' places
            if(round){
                if(!isNaN(theObj[d])){
                    finalObj[d] = Math.round(theObj[d] * Math.pow(10,round)) / (Math.pow(10,round));  
                } else {
                    finalObj[d] = theObj[d];                
                }
            } else {
                finalObj[d] = theObj[d];
            }
        });
    return finalObj;
}

// Build out our test suite
describe("The Solve method takes a problem and solves it",
    function () {
        var solver = require("../src/solver");
        // Iterate over each problem in the suite
        problems.forEach(function (d) {
            // Generic "Should" Statement
            // (should come up with a better test scheme and description...)
            it("should be able to solve the " + d.name,
                function () {
                    // Each problem has its correct answer attached to its
                    // JSON as an "expects" object
                    var a = d.expects,
                        b = solver.Solve(d);

                    assert.deepEqual(
                        // Compare what we expect the problem to be
                        // to what solver comes up with, rounding
                        // to 5 decimal places; sorting the object
                        // so that both objects match in order
                        // and precision...
                        sortObject(b,5),
                        sortObject(a,5)
                    );
                });
            }
        );
    }
);
