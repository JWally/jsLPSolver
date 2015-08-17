var solver = require("../src/solver"),
    model = require("../../opt/testing/SPY.json")[1],
    //model = require("../test/all_problems.json")[0],
    fs = require("fs");
    

var a = solver.Model(model);

fs.writeFile("./lp_model.lp", a.join("\n"));

/*
    

var a = solver.Solve(model);
console.log("\n\n");
console.log(a);
*/