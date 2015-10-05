/*global describe*/
/*global require*/
/*global it*/

var assert = require("assert"),
    problems = require("./problems.json");

problems = problems.concat(require("./all_problems.json"));

// Kick off the second "Monster" problem
problems.splice(-1,1);

// For testing, Function to sort an object
function sortObject(theObj, round) {
    var finalObj = {};

    Object.keys(theObj).sort()
        .forEach(function (d) {
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


describe("The Solve method takes a problem and solves it",
    function () {
        var solver = require("../src/solver");

        problems.forEach(function (d) {
            it("should be able to solve the " + d.name,
                function () {
                    var a = d.expects,
                        b = solver.Solve(d);

                    assert.deepEqual(
                        sortObject(b,5),
                        sortObject(a,5)

                    );
                });
        });
    });
