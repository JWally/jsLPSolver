/*jshint -W083 */

/*************************************************************
* Method: to_JSON
* Scope: Public:
* Agruments: input: Whatever the user gives us
* Purpose: Convert an unfriendly formatted LP
*          into something that our library can
*          work with
**************************************************************/
function to_JSON(input) {
    "use strict";
    const rxo = {
        /* jshint ignore:start */
        "is_blank": /^\W{0,}$/,
        "is_objective": /(max|min)(imize){0,}\:/i,
        "is_int": /^(?!\/\*)\W{0,}int/i,
        "is_bin": /^(?!\/\*)\W{0,}bin/i,
        "is_constraint": /(\>|\<){0,}\=/i,
        "is_unrestricted": /^\S{0,}unrestricted/i,
        "parse_lhs": /(\-|\+){0,1}\s{0,1}\d{0,}\.{0,}\d{0,}\s{0,}[A-Za-z]\S{0,}/gi,
        "parse_rhs": /(\-|\+){0,1}\d{1,}\.{0,}\d{0,}\W{0,}\;{0,1}$/i,
        "parse_dir": /(\>|\<){0,}\=/gi,
        "parse_int": /[^\s|^\,]+/gi,
        "parse_bin": /[^\s|^\,]+/gi,
        "get_num": /(\-|\+){0,1}(\W|^)\d+\.{0,1}\d{0,}/g,
        "get_word": /[A-Za-z].*/
        /* jshint ignore:end */
    };

    const model = {
        "opType": "",
        "optimize": "_obj",
        "constraints": {},
        "variables": {}
    }
    const constraints = {
        ">=": "min",
        "<=": "max",
        "=": "equal"
    };


    // Handle input if its coming
    // to us as a hard string
    // instead of as an array of
    // strings
    if (typeof input === "string") {
        input = input.split("\n");
    }

    // Start iterating over the rows
    // to see what all we have
    for (let i = 0; i < input.length; i++) {

        const constraint = "__" + i;

        // Get the string we're working with
        let inputValue = input[i];

        // Set the test = 0
        // tst = 0;

        // Reset the array
        // ary = null;

        // Test to see if we're the objective
        if (rxo.is_objective.test(inputValue)) {
            // Set up in model the opType
            model.opType = inputValue.match(/(max|min)/gi)[0];

            // Pull apart lhs
            const ary = inputValue.match(rxo.parse_lhs).map(function (d) {
                return d.replace(/\s+/, "");
            }).slice(1);



            // *** STEP 1 *** ///
            // Get the variables out
            ary.forEach(function (d) {

                // Get the number if its there
                let hldr = d.match(rxo.get_num);

                // If it isn't a number, it might
                // be a standalone variable
                if (hldr === null) {
                    if (d.substr(0, 1) === "-") {
                        hldr = -1;
                    } else {
                        hldr = 1;
                    }
                } else {
                    hldr = hldr[0];
                }

                hldr = parseFloat(hldr);

                // Get the variable type
                const hldr2 = d.match(rxo.get_word)[0].replace(/\;$/, "");

                // Make sure the variable is in the model
                model.variables[hldr2] = model.variables[hldr2] || {};
                model.variables[hldr2]._obj = hldr;

            });
            ////////////////////////////////////
        } else if (rxo.is_int.test(inputValue)) {
            // Get the array of ints
            const ary = inputValue.match(rxo.parse_int).slice(1);

            // Since we have an int, our model should too
            model.ints = model.ints || {};

            ary.forEach(function (d) {
                d = d.replace(";", "");
                model.ints[d] = 1;
            });
            ////////////////////////////////////
        } else if (rxo.is_bin.test(inputValue)) {
            // Get the array of bins
            const ary = inputValue.match(rxo.parse_bin).slice(1);

            // Since we have an binary, our model should too
            model.binaries = model.binaries || {};

            ary.forEach(function (d) {
                d = d.replace(";", "");
                model.binaries[d] = 1;
            });
            ////////////////////////////////////
        } else if (rxo.is_constraint.test(inputValue)) {
            const separatorIndex = inputValue.indexOf(":");
            const constraintExpression = (separatorIndex === -1) ? inputValue : inputValue.slice(separatorIndex + 1);

            // Pull apart lhs
            const ary = constraintExpression.match(rxo.parse_lhs).map(function (d) {
                return d.replace(/\s+/, "");
            });

            // *** STEP 1 *** ///
            // Get the variables out
            ary.forEach(function (d) {
                // Get the number if its there
                let hldr = d.match(rxo.get_num);

                if (hldr === null) {
                    if (d.substr(0, 1) === "-") {
                        hldr = -1;
                    } else {
                        hldr = 1;
                    }
                } else {
                    hldr = hldr[0];
                }

                hldr = parseFloat(hldr);


                // Get the variable name
                const hldr2 = d.match(rxo.get_word)[0];

                // Make sure the variable is in the model
                model.variables[hldr2] = model.variables[hldr2] || {};
                model.variables[hldr2][constraint] = hldr;

            });

            // *** STEP 2 *** ///
            // Get the RHS out
            const rhs = parseFloat(inputValue.match(rxo.parse_rhs)[0]);

            // *** STEP 3 *** ///
            // Get the Constrainer out
            inputValue = constraints[inputValue.match(rxo.parse_dir)[0]];
            model.constraints[constraint] = model.constraints[constraint] || {};
            model.constraints[constraint][inputValue] = rhs;
            ////////////////////////////////////
        } else if (rxo.is_unrestricted.test(inputValue)) {
            // Get the array of unrestricted
            const ary = inputValue.match(rxo.parse_int).slice(1);

            // Since we have an int, our model should too
            model.unrestricted = model.unrestricted || {};

            ary.forEach(function (d) {
                d = d.replace(";", "");
                model.unrestricted[d] = 1;
            });
        }
    }
    return model;
}


/*************************************************************
* Method: from_JSON
* Scope: Public:
* Agruments: model: The model we want solver to operate on
* Purpose: Convert a friendly JSON model into a model for a
*          real solving library...in this case
*          lp_solver
**************************************************************/
function from_JSON(model) {
    "use strict";
    // Make sure we at least have a model
    if (!model) {
        throw new Error("Solver requires a model to operate on");
    }

    var output = "",
        // ary = [],
        // norm = 1,
        lookup = {
            "max": "<=",
            "min": ">=",
            "equal": "="
        },
        rxClean = new RegExp("[^A-Za-z0-9_\[\{\}\/\.\&\#\$\%\~\'\@\^]", "gi");

    // Build the objective statement

    if (model.opType) {

        output += model.opType + ":";

        // Iterate over the variables
        for (var x in model.variables) {
            // Give each variable a self of 1 unless
            // it exists already
            model.variables[x][x] = model.variables[x][x] ? model.variables[x][x] : 1;

            // Does our objective exist here?
            if (model.variables[x][model.optimize]) {
                output += " " + model.variables[x][model.optimize] + " " + x.replace(rxClean, "_");
            }
        }
    } else {
        output += "max:";
    }



    // Add some closure to our line thing
    output += ";\n\n";

    // And now... to iterate over the constraints
    for (var xx in model.constraints) {
        for (var y in model.constraints[xx]) {
            if (typeof lookup[y] !== "undefined") {

                for (var z in model.variables) {

                    // Does our Constraint exist here?
                    if (typeof model.variables[z][xx] !== "undefined") {
                        output += " " + model.variables[z][xx] + " " + z.replace(rxClean, "_");
                    }
                }
                // Add the constraint type and value...

                output += " " + lookup[y] + " " + model.constraints[xx][y];
                output += ";\n";

            }
        }
    }

    // Are there any ints?
    if (model.ints) {
        output += "\n\n";
        for (var xxx in model.ints) {
            output += "int " + xxx.replace(rxClean, "_") + ";\n";
        }
    }

    // Are there any unrestricted?
    if (model.unrestricted) {
        output += "\n\n";
        for (var xxxx in model.unrestricted) {
            output += "unrestricted " + xxxx.replace(rxClean, "_") + ";\n";
        }
    }

    // And kick the string back
    return output;

}


export default function Reformat(model) {
    // If the user is giving us an array
    // or a string, convert it to a JSON Model
    // otherwise, spit it out as a string
    if (model.length) {
        return to_JSON(model);
    } else {
        return from_JSON(model);
    }
}

