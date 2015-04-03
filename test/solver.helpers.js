/*global require*/
/*global describe*/
/*global it*/


var assert = require("assert");


describe("The Helper Object exposes helper functions of the Solver module",
    function () {
        var solver = require("../src/solver"),
            helper = solver._helpers;

        // DESCRIBING THE MAX FUNCTION    
        describe("max", function () {
            it("should find the max value in a 1d array", function () {
                assert.equal(11, helper.max([-11, 1, 2, 3,
                    4, 5, 6, 7,
                    11
                ]));
                assert.equal(177, helper.max([-11, 1, 2, 3,
                    4, 5, 6, 7,
                    177
                ]));
            });
        });

        // DESCRIBING THE MIN FUNCTION
        describe("min", function () {
            it("should find the minimum value in a 1d array",
                function () {
                    assert.equal(-11, helper.min([-11, 1, 2, 3,
                        4, 5, 6, 7,
                        11
                    ]));
                    assert.equal(-11, helper.min([-11, 1, 2, 3,
                        4, 5, 6, 7,
                        177
                    ]));
                });
        });

        // DESCRIBE THE ROUNDING FUNCTION
        describe("round", function () {
            it("should round a number to the nearest whole number",
                function () {
                    assert.equal(5, helper.round(5.11111111111,
                        0));
                    assert.equal(5, helper.round(4.50000000000,
                        0));
                    assert.notEqual(5, helper.round(
                        4.499999999999, 0));
                });

            it("should round to a user defined position", function () {
                assert.equal(5.11, helper.round(
                    5.1111111111, 2));
            });
        });



    });
