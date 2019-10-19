/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/

(async () => {

    console.log("hey there");

    var solver = require("../../src/solver");
    var fs = require("fs");


    var ary = fs.readdirSync("test/test-sanity/")
                .filter(function(file){return /\.json$/.test(file);});


    for(var i = 0; i < ary.length; i++){
        
        model = ary[i];
        
        model = fs.readFileSync("test/test-sanity/" + model, "utf8");

        model = JSON.parse(model);
        console.log("");
        console.log("");
        console.log("-----------------");
        console.log("-----------------");
        
        if(model.ints){int_count = Object.keys(model.ints).length} else {int_count = 0}
        console.log(model.name,"[",Object.keys(model.variables).length, " variables,", Object.keys(model.constraints).length," constraints, ",int_count," integers ]")
        model["external"] = {
            "solver": "lpsolve",
            "binPath": "C:/lpsolve/lp_solve.exe",
            "tempName": "C:/temp/out.txt",
            "args": [
                "-presolve",
                "-presolver",
                "-s2",
                "-timeout",
                8,
                "-gr",
                0.001
            ]
        }
        


        console.time("lpsolve");
        await solver.Solve(model)
            .then(function(data){
                //fs.writeFileSync("C:/temp/" + model.name + ".json", JSON.stringify(data, null, "\t"));
            })
            .catch(function(e){
                //console.log(e)
                //fs.renameSync("C:/temp/out.txt","C:/temp/error_" + model.name.replace(/[^A-Za-z0-9]/gi,"_") + ".txt");
            });
        console.timeEnd("lpsolve");
        delete model.external;
        console.time("jsLPSolver");
        var a = solver.Solve(model);
        console.timeEnd("jsLPSolver");
    }



})();


