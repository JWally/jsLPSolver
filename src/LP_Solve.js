/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/


 /*************************************************************
 * Method: ReformatLP
 * Scope: Public:
 * Agruments: model: The model we want solver to operate on
 * Purpose: Convert a friendly JSON model into a model for a
 *          real solving library...in this case
 *          lp_solver
 **************************************************************/
module.exports = function (model, fx) {
        // Make sure we at least have a model
        if (!model) {
            throw new Error("Solver requires a model to operate on");
        }

        var output = "",
            ary = [],
            norm = 1,
            lookup = {
                "max": "<=",
                "min": ">=",
                "equal": "="
            },
            rxClean = new RegExp("[^A-Za-z0-9]+", "gi");

        // Build the objective statement
        output += model.opType + ":";

        // Iterate over the variables
        for(var x in model.variables){
            // Give each variable a self of 1 unless
            // it exists already
            model.variables[x][x] = model.variables[x][x] ? model.variables[x][x] : 1;

            // Does our objective exist here?
            if(model.variables[x][model.optimize]){
                output += " " + model.variables[x][model.optimize] + " " + x.replace(rxClean,"_");
            }
        }

        // Add some closure to our line thing
        output += ";\n";

        // And now... to iterate over the constraints
        for(x in model.constraints){
            for(var y in model.constraints[x]){
                for(var z in model.variables){
                    // Does our Constraint exist here?
                    if(model.variables[z][x]){
                        output += " " + model.variables[z][x] + " " + z.replace(rxClean,"_");
                    }
                }
                // Add the constraint type and value...
                output += " " + lookup[y] + " " + model.constraints[x][y];
                output += ";\n";
            }
        }

        // Are there any ints?
        if(model.ints){
            output += "\n\n";
            for(x in model.ints){
                output += "int " + x.replace(rxClean,"_") + ";\n";
            }
        }

        // And kick the string back
        return output;
    };