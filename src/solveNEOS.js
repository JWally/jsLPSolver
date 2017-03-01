    /*************************************************************
     * Method: solveNEOS
     * Scope: Public:
     * Dependency on jQuery
     * Agruments: model: The model we want solver to operate on
     *            optcr: The solver will stop the solution process 
     *                   when the proportional difference between 
     *                   the solution found and the best theoretical 
     *                   objective function is guaranteed to be 
     *                   smaller than optcr. 
     *                   (defaults to 0.1)
     *           status: HTML element where status updates are
                         posted to
                  email: E-Mail required for the use of CPLEX solver
                         Will be forwarded to IBM and may be used for
                         promotional purposes.
                    log: If set to true, the GAMS model and listing
                         file will be logged to the console
     * Purpose: Convert JSON model to GAMS, solve with NEOS CPLEX,
                await results, and interpret listing file 
     **************************************************************/
    this.solveNEOS = this.solveNEOS = function (model, optcr, status, email, log) {
        return new Promise(function(resolve, reject) {
            // Make sure we at least have a model
            if (!model) {
                throw new Error("Solver requires a model to operate on");
            }

            // Check variable names for compatibility with GAMS
            var charAlert = false;        
            for (var i = 0; i < Object.keys(model.variables).length; i++) {
                var variableName = Object.keys(model.variables)[i];
                if (variableName.charAt(0) === "_") {
                    throw new Error("GAMS does not allow variables to start with a '_' character");
                } else if (model.optimize.charAt(0) === "_") {
                    throw new Error("GAMS does not allow the objective variable to start with a '_' character");
                } else if (variableName.length > 8) {
                    charAlert = true;
                }
            }

            // Alert user when variable names too long (variables have to be distinguishable before the first 8 characters), 
            // otherwise ignorable
            if (charAlert === true) {
                window.console.log("It is recommended to reduce the lenght of the variable names to less than 8 characters " +
                    "in order to avoid issues with the GAMS listing interpretation");
            }

            // Reformat model to GAMS notation
            var GAMSmodel = reformatGAMS(model, optcr);
            
            // Log model if log flag is set to true
            if (log === true) {
                window.console.log(GAMSmodel);
            }
            // Create XML string including model for submission to NEOS Servers
            var xmlString = '<document> <category>milp</category> <solver>CPLEX</solver> <inputMethod>GAMS</inputMethod>' +
                            ' <model><![CDATA[' + GAMSmodel + ']]></model> <options><![CDATA[]]></options>' + 
                            ' <gdx><![CDATA[]]></gdx> <wantgdx><![CDATA[]]></wantgdx> <wantlog><![CDATA[]]></wantlog> ' + 
                            '<comments><![CDATA[]]></comments> <email>' + email + '</email> </document>';


            // Submit string to NEOS      
            NEOSSubmitStringAndWait(xmlString, status, resultCallback);

            // Callback from NEOSSubmitStringAndWait
            function resultCallback (arg) {
                // Log GAMS listing if log flag is set to true
                if (log === true) {
                    window.console.log(arg.results);
                }
                var store = lstParse(arg, model);
                // Check if result of parsing return failure String or JSON
                if (typeof store === "string") {
                    reject(store)
                } else {
                    resolve(store);
                }
            }
        }); 
    };