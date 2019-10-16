/*global describe*/
/*global require*/
/*global it*/
/*global console*/
/*global process*/


// //////////////////////////////////////////////////
// name:        "/test/solver.problems.js"
// purpose:     "test runner for grunt-mocha"
// arguments:   "name of the directory to pull test-models from"
//
//
var assert = require("assert");
var fs = require("fs");

// This is useful, because it lets us tell the test-runner
// Which directory of models to go through...
var path_of = process.argv[2];





// Step 1.) Get a list of all ".json" models in the directory the user
//          gives us.
//
//          TODO: Error Handling for when the user gives us a bad directory...
//
//
var ary = fs.readdirSync("test/" + path_of + "/")
            .filter(function(file){return /\.json$/.test(file);});





// Step 2.) Open the models, and load them into an array named "problems"
//
//          TODO: Instead of opening all the models at once, maybe open just
//          in time...
//
var problems = ary.map(function(x){
    var tmp = fs.readFileSync("test/" + path_of + "/" + x, "utf8");
    console.log("opening - ",x);
    return JSON.parse(tmp);
});





// Step 3. [kind of]) Build a function to evaluate the results of the model
//                      and its expected results..
//
//
function assertSolution(solutionA, solutionB) {
    
    //
    // Quick and dirty way to compare 2 objects
    // Excluding other crap we throw in the solution
    // for sake of legacy or ease...
    //
    
    // 0.) Check Feasibility as to not burn cycles needlessly...
    //     Also...all models must have a "feasible" attribute...
    //
    //     TODO: Enforce that all 'solve' methods return a 'feasible'
    //           attribute
    //
    if(solutionA.feasible === false && solutionB.feasible === false){
        // Skip work, and return that the model couldn't solve it...
        //
        return assert.deepEqual(true, true);
    } else {
        
        
        // 1.) Remove aforementioned noise...
        ["isIntegral","bounded"].forEach(function(noise){
            delete solutionA[noise];
            delete solutionB[noise];
        });
        
        // 2.) To keep track of what we've already hit...
        var keys = {},
            fail_actual = {},
            fail_expects = {};
        
        // 3.) Build an object with the keys from the 'expected' results
        //     and the actual results...

        Object.keys(solutionA)
            .forEach(function(key){
                keys[key] = 1;
            });
        
        Object.keys(solutionB)
            .forEach(function(key){
                    keys[key] = 1;
            });
        
        // 4.) Loop through each UNIQUE key the models provided,
        Object.keys(keys).forEach(function(key){
            
            // 5.) Format the result provided
            //
            // n.b. for all intents and purposes, an attribute being 0
            //      is essentially the same as it not being there ('undefined')
            //      thus, here, undefined *IS* 0...
            //

            var temp_a = {},
                temp_b = {};
                

            if(typeof solutionB[key] === "undefined"){

                temp_a[key] = solutionA[key];
                temp_b[key] = 0;

            } else if(typeof solutionA[key] === "undefined"){

                temp_b[key] = solutionB[key];
                temp_a[key] = 0;

            } else if(key === "feasible"){
                //
                // Clean this crap up. 
                // This is lazy.
                // *sigh*
                // ...
                // Do Nothing...
                var fake = true;
            } else {

                temp_a[key] = solutionA[key].toFixed(6);
                // Need to be able to handle "Infinity"
                //
                temp_b[key] = parseFloat(solutionB[key]).toFixed(6);

            }

            try{
                assert.deepEqual(temp_a, temp_b);
            } catch(e){
                fail_actual[key] = solutionA[key];
                fail_expects[key] = solutionB[key];
            }

        });

        
        return assert.deepEqual(fail_actual, fail_expects);

    }
}

// Build out our test suite
describe("Test Suite of EXPECTED results to ACTUAL results:",
    function () {
        var solver = require("../src/solver");
        // Iterate over each problem in the suite
        problems.forEach(function (jsonModel) {
            // Generic "Should" Statement
            // (should come up with a better test scheme and description...)
            it("Model Name: " + jsonModel.name,
                function () {
                    
                    
                    
                    // Look to see if the JSON Model's "expects"
                    // has a "_timeout". If so, set it and delete it (to not
                    // interfere with any test expectations)
                    if(jsonModel.expects._timeout){
                        this.timeout(jsonModel.expects._timeout);
                        delete jsonModel.expects._timeout;
                    }


                    // Each problem has its correct answer attached to its
                    // JSON as an "expects" object
                    
                    //
                    // TODO: This is where you can handle the type
                    // of solver used.
                    //
                    // Say if the model has an "external" attribute,
                    // use whatever the external attribute tells it to
                    // do...
                    
                    var expectedResult = jsonModel.expects,
                        obtainedResult = solver.Solve(jsonModel);

                    // Compare what we expect the problem to be
                    // to what solver comes up with
                    
                    
                    
                    
                    assertSolution(
                        obtainedResult,
                        expectedResult
                    );
                });
        });
    });
