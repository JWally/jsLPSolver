var solver = require("../src/solver"),
    models = require("../test/all_problems.json"),
    model = models[models.length - 1],
    fs = require("fs");


var a = solver.ReformatLP(model);
fs.writeFile("./test/lp_model.lp", a.join("\n"));
