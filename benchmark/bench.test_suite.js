/*global describe*/
/*global require*/
/*global it*/
/*global console*/
/*global process*/



var walk = require("walk");
var fs = require("fs");
var solver = require("../src/solver");

var problems = [];

// Parsing test problems
var walker = walk.walkSync("../test/problems", {
    followLinks: false,
    listeners: {
        file: function (root, fileStats) {
            // Add this file to the list of files
            var fileName = fileStats.name;
            console.log("fileName", fileName);

            // Ignore files that start with a "."
            if (fileName[0] === ".") {
                return;
            }

            var fileRoot = root.substr("test/problems".length + 1);
            var fullFilePath = "./" + root + "/" + fileName;
            var jsonContent = JSON.parse(fs.readFileSync(fullFilePath));
            problems.push(jsonContent);
        }
    }
});



console.log("------------------------");
console.log("-FORWARD-");
console.log("------------------------");

var log = {};


for (var i = 0; i < problems.length; i++) {

    var k = 0,
        j = problems[i];


        log[j.name] = {};

        for(var constraint in j.constraints){
            if(j.constraints[constraint].max){
                log[j.name].constraints = log[j.name].constraints  || 0;
                log[j.name].constraints++;
            }

            if(j.constraints[constraint].min){
                log[j.name].constraints = log[j.name].constraints  || 0;
                log[j.name].constraints++;
            }
        }

        log[j.name].variables = Object.keys(j.variables).length;

        if(j.ints){
            log[j.name].ints = Object.keys(j.ints).length;
        }

}

for( i = 0; i < problems.length; i++){
    j = problems[i];
    var date_0 = process.hrtime();
    var d = solver.Solve(j, 1e-8, true);
    var a = process.hrtime(date_0);

    log[j.name] = d;
    log[j.name].time =  a[0] + a[1] / 1e9;

}

console.log(log);
