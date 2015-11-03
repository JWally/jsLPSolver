/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/
/*global exports*/


// All functions in this module that
// get exported to main ***MUST***
// return a functional LPSolve JSON style
// model or throw an error

exports.CleanObjectiveAttributes = function(model){
  // Test to see if the objective attribute
  // is also used by one of the constraints
  //
  // If so...create a new attribute on each
  // variable
    
    if(model.constraints[model.optimize]){
        // Create the new attribute
        var fakeAttr = Math.random();

        // Go over each variable and check
        for(var x in model.variables){
            // Is it there?
            if(model.variables[x][model.optimize]){
                model.variables[x][fakeAttr] = model.variables[x][model.optimize];
            }
        }

    // Now that we've cleaned up the variables
    // we need to clean up the constraints
        model.constraints[fakeAttr] = model.constraints[model.optimize];
        delete model.constraints[model.optimize];
        return model;

    } else {
    
        return model;
    }
};
