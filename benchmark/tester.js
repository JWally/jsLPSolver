var solver = require("../src/solver"),
    helpers = solver._helpers;

var problem = {
        "name": "Integer Clothing Shop Problem II",
        "optimize": "profit",
        "opType": "max",
        "constraints": {
            "yards": {
                "max": 150
            },
            "hours": {
                "max": 200
            }
        },
        "variables": {
            "coat": {
                "hours": 10,
                "yards": 3,
                "profit": 50,
                "coat": 1
            },
            "pants": {
                "hours": 4,
                "yards": 5,
                "profit": 40,
                "pants": 1
            },
            "hat": {
                "hours": 12,
                "yards": 1,
                "profit": 10,
                "hat": 1
            },
            "socks": {
                "hours": 0.5,
                "yards": 0.5,
                "profit": 0.5,
                "socks": 1
            }
        }
    }


var a = solver.Solve(problem);
console.log("\n\n");
console.log(a);


