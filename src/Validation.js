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
    var fakeAttr,
        x, z;
  
    if(typeof model.optimize === "string"){
        if(model.constraints[model.optimize]){
            // Create the new attribute
            fakeAttr = Math.random();

            // Go over each variable and check
            for(x in model.variables){
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
    } else {
        // We're assuming its an object?
        for(z in model.optimize){
            if(model.constraints[z]){
            // Make sure that the constraint
            // being optimized isn't constrained
            // by an equity collar
                if(model.constraints[z] === "equal"){
                    // Its constrained by an equal sign;
                    // delete that objective and move on
                    delete model.optimize[z];
                
                } else {
                    // Create the new attribute
                    fakeAttr = Math.random();

                    // Go over each variable and check
                    for(x in model.variables){
                        // Is it there?
                        if(model.variables[x][z]){
                            model.variables[x][fakeAttr] = model.variables[x][z];
                        }
                    }
                // Now that we've cleaned up the variables
                // we need to clean up the constraints
                    model.constraints[fakeAttr] = model.constraints[z];
                    delete model.constraints[z];            
                }
            }    
        }
        return model;
    }
};
