var assert = require("assert"),
    models = {};


models["Coffee Shop"] = {
    "optimize": "profit",
    "opType": "max",
    "constraints": {
        "Costa Rican": {
            "max": 200
        },
        "Etheopian": {
            "max": 330
        }
    },
    "variables": {
        "Yusip": {
            "Costa Rican": 0.5,
            "Etheopian": 0.5,
            profit: 3.5
        },
        "Exotic": {
            "Costa Rican": 0.25,
            "Etheopian": 0.75,
            profit: 4
        }
    }
};


describe("Suite of Simple Solver Models", function () {
    var Solver = require("../src/solver");
    solver = new Solver();

    describe("Coffee Shop", function () {
        it("should show up", function () {
            assert.deepEqual({
                    "feasible": true,
                    "Yusip": 269.99999999999994,
                    "Exotic": 260.00000000000006,
                    "result": 1985
                },
                solver.Solve(models["Coffee Shop"]));
        });
    });
});
