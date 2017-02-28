	 /*************************************************************
     * Method: reformatGAMS
     * Scope: Public:
     * Agruments: model: The model we want solver to operate on
     			  optcr: Termination tolerance
     * Purpose: Convert a friendly JSON model into a model for a
     *          real solving library...in this case
     *          GAMS
     **************************************************************/
	//    this.reformatGAMS = function (model, optcr) {
	function reformatGAMS(model, optcr) {
	    // Make sure we at least have a model
	    if (!model) {
	        throw new Error("Solver requires a model to operate on");
	    }

	    var ints = true;
	    var binaries = true;
	    if (typeof model.ints === "undefined") {
	        ints = false;
	    }
	    if (typeof model.binaries === "undefined") {
	        binaries = false;
	    }

	    // Set optcr to GAMS default if not stated otherwise
	    if (!optcr) {
	        optcr = 0.1;
	    }

	    // Variables used within the entire function
	    var start,
	        comma,
	        variablesPath;

	    // Create GAMS variables that are non integer or binary
	    var variablesCount = Object.keys(model.variables);
	    var variables = [model.optimize];
	    var objectiveConstraint = '';

	    for (var i = 0; i < variablesCount.length; i++) {
	        var variableName = variablesCount[i];
	        variablesPath = model.variables[variablesCount[i]];

	        if (objectiveConstraint === '') {
	            start = ' ';
	        } else {
	        	start = ' + ';
	        }

	        if (ints === true && binaries === true) {
	            if (!(variableName in model.ints) && !(variableName in model.binaries)) {
	                variables.push(variableName);
	            }
	        } else if (ints === true && binaries === false) {
	            if (!(variableName in model.ints)) {
	                variables.push(variableName);
	            }
	        } else if (ints === false && binaries === true) {
	            if (!(variableName in model.binaries)) {
	                variables.push(variableName);
	            }
	        }

	        if (model.optimize in model.variables[variablesCount[i]]) {
	            objectiveConstraint += start + variablesCount[i] + ' * ' + "(" + variablesPath[model.optimize].toFixed(2) + ")" + '\n';
	        }
	    }

	    // Create equations, corresponding constraints and objective function
	    var constraintsCount = Object.keys(model.constraints);
	    var equations = {};
	    equations.objective = {};
	    equations.objective.name = 'e_Objective';
	    equations.objective.constraint = model.optimize + ' ' + ' =e= ' + objectiveConstraint + ' ;';


	    // Loop through constraints, create one equation per constraint
	    for (var i = 0; i < constraintsCount.length; i++) {
	        equations[[i]] = {};
	        equations[[i]].name = 'e_' + constraintsCount[i];

	        var constraintPath = model.constraints[constraintsCount[i]],
	            constraintOperator,
	            constraintProperty = Object.getOwnPropertyNames(constraintPath)[0];

	        switch (constraintProperty) {
	            case 'max':
	                constraintOperator = '=g=';
	                break;
	            case 'min':
	                constraintOperator = '=l=';
	                break;
	            case 'equal':
	                constraintOperator = '=e=';
	                break;
	            default:
	                throw new Error("The objective for the constraint /'" + constraintsCount[i] + "/' is not compatible." +
	                    " Check for typos in 'max', 'min' or 'equal'.");
	        }

	        var constraintText = '';

	        // Loop through variables to multiply with equations
	        for (var j = 0; j < variablesCount.length; j++) {
	            variablesPath = model.variables[variablesCount[j]];

	            if (constraintText === '') {
	            	start = ' ';
	        	} else {
	        		start = ' + ';
	        	}

	            if (constraintsCount[i] in variablesPath) {
	                constraintText += start + variablesCount[j] + ' * ' + "(" + variablesPath[constraintsCount[i]].toFixed(2) + ")";
	            }
	        }
	        equations[[i]].constraint = "(" + constraintPath[constraintProperty].toFixed(2) + ")" + ' ' + constraintOperator +
	            constraintText + ' ;';
	    }


	    // Create GAMS input file - YAY
	    var GAMSinput = '';

	    // 1st add Comment section
	    GAMSinput += '$ontext\n  jsLPsolver conversion\n  project: ' + model.name + '\n$offtext\n\n';

	    // add Variables
	    GAMSinput += 'Variable  \n ';
	    for (var i = 0; i < variables.length; i++) {
	        if (i === variables.length - 1) {
	            comma = '';
	        } else {
	        	comma = ', ';
	        }
	        GAMSinput += variables[i] + comma + '\n  ';
	    }
	    GAMSinput += ';\n\n';

	    // add binary variables
	    if (binaries === true) {
	        var binaryCount = Object.keys(model.binaries);
	        if (binaryCount.length > 0) {
	            GAMSinput += 'Binary Variable  \n';
	            for (var i = 0; i < binaryCount.length; i++) {
	                comma = ', ';
	                if (i === binaryCount.length - 1) {
	                    comma = '';
	                }
	                GAMSinput += binaryCount[i] + comma + '\n  ';
	            }
	            GAMSinput += ';\n\n';
	        }
	    }


	    // add integer variables
	    if (ints === true) {
	        var intsCount = Object.keys(model.ints);
	        if (intsCount.length > 0) {
	            GAMSinput += 'Integer Variable  \n';
	            for (var i = 0; i < intsCount.length; i++) {
	                comma = ', ';
	                if (i === intsCount.length - 1) {
	                    comma = '';
	                }
	                GAMSinput += intsCount[i] + comma + '\n  ';
	            }
	            GAMSinput += '; \n\n';
	        }
	    }

	    // add equations
	    var eqsCount = Object.keys(equations);
	    GAMSinput += 'Equation  \n';
	    for (var i = 0; i < eqsCount.length; i++) {
	        comma = ', ';
	        if (i === eqsCount.length - 1) {
	            comma = '';
	        }
	        GAMSinput += equations[eqsCount[i]].name + comma + '\n  ';
	    }
	    GAMSinput += '; \n\n';

	    // add constraints
	    for (var i = 0; i < eqsCount.length; i++) {
	        GAMSinput += equations[eqsCount[i]].name + '.. \n  ' + equations[eqsCount[i]].constraint + '\n  ';
	    }

	    // add model statement
	    GAMSinput += '\nmodel ' + model.name + ' / all /; \n';
	    // add optcr
	    GAMSinput += 'option optcr = ' + optcr + '; \n';

	    // and finally the solve statement!
	    var opType = 'maximizing ';
	    if (model.opType === 'min') {
	        opType = 'minimizing ';
	    }
	    GAMSinput += 'solve ' + model.name + ' using MIP ' + opType + model.optimize + ';';

	    // replace non ascii characters and umlauts in GAMS file
	    GAMSinput = GAMSinput.replace(/[^\x00-\x7F]/g, "");
	    GAMSinput = GAMSinput.replace(/ü/, "ue");
	    GAMSinput = GAMSinput.replace(/ö/, "oe");
	    GAMSinput = GAMSinput.replace(/ä/, "ae");
	    GAMSinput = GAMSinput.replace(/Ü/, "Ue");
	    GAMSinput = GAMSinput.replace(/Ö/, "Oe");
	    GAMSinput = GAMSinput.replace(/Ä/, "Ae");

	    return GAMSinput;

	}