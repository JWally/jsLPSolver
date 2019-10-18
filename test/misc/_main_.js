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

        console.log("-----------------");
        console.log("-----------------");
        console.log(model.name)
        console.log("-----------------");
        console.log("-----------------");
        
        model["external"] = {
            "solver": "lpsolve",
            "binPath": "C:/lpsolve/lp_solve.exe",
            "tempName": "C:/temp/out.txt",
            "args": [
                "-s2",
                "-timeout",
                8
            ]
        }
        


        await solver.Solve(model)
            .then(data => console.log())
            .catch(function(e){
                for(j = 0; j < 1; j++){
                    console.log(e);
                    // 1 = timeout
                    // 2 = infeasible
                    // 3 = unbounded
                    if(e.code != "2" && e.code != "3" && e.code != "1"){
                        fs.renameSync("C:/temp/out.txt","C:/temp/" + model.name.replace(/[^A-Za-z0-9]/gi,"_") + ".txt");
                    }
                }

                //throw new Error("STOP IT!!!");
            });
        
    }



})();


