var solver = require("../src/solver"),
    helpers = solver._helpers;

var problem = {
        "name": "CURRENCY ARB PROBLEM",
        "optimize": "NOTHING",
        "opType": "max",
        "constraints": {
            "DOLLARS": {"max": 1,"min": 1},
            "EUROS": {"max": 0,"min": 0},
            "POUNDS": {"max": 0,"min": 0},
            "YEN": {"max": 0,"min": 0}
        },
        "variables": {
            "DOLLARS -> EUROS": {"DOLLARS": -1,"EUROS": 1.1486},
            "DOLLARS -> POUNDS": {"DOLLARS": -1,"POUNDS": 0.7003},
            "DOLLARS -> YEN": {"DOLLARS": -1,"YEN": 133.33},
            "EUROS -> DOLLARS": {"EUROS": -1,"DOLLARS": 0.8706},
            "EUROS -> POUNDS": {"EUROS": -1,"POUNDS": 0.6097},
            "EUROS -> YEN": {"EUROS": -1,"YEN": 116.14},
            "POUNDS -> DOLLARS": {"POUNDS": -1,"DOLLARS": 1.4279},
            "POUNDS -> EUROS": {"POUNDS": -1,"EUROS": 1.6401},
            "POUNDS -> YEN": {"POUNDS": -1,"YEN": 190.48},
            "YEN -> DOLLARS": {"YEN": -1,"DOLLARS": 0.0075},
            "YEN -> EUROS": {"YEN": -1,"EUROS": 0.00861},
            "YEN -> POUNDS": {"YEN": -1,"POUNDS": 0.00525}
        }
    }


var a = solver.Solve(problem);
console.log("\n\n");
console.log(a);


