(function(){if (typeof exports === "object") {module.exports =  require("./main");}})();
(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
},{}],2:[function(require,module,exports){
/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/

//-------------------------------------------------------------------
//-------------------------------------------------------------------
function Cut(type, varIndex, value) {
    this.type = type;
    this.varIndex = varIndex;
    this.value = value;
}

//-------------------------------------------------------------------
//-------------------------------------------------------------------
function Branch(relaxedEvaluation, cuts) {
    this.relaxedEvaluation = relaxedEvaluation;
    this.cuts = cuts;
}

//-------------------------------------------------------------------
// Branch sorting strategies
//-------------------------------------------------------------------
function sortByEvaluation(a, b) {
    return b.relaxedEvaluation - a.relaxedEvaluation;
}

//-------------------------------------------------------------------
// Function: MILP
// Detail: Main function, my attempt at a mixed integer linear programming
//         solver
//-------------------------------------------------------------------
function MILP(model) {
    var branches = [];
    var iterations = 0;
    var tableau = model.tableau;

    // This is the default result
    // If nothing is both *integral* and *feasible*
    var bestEvaluation = Infinity;
    var bestSolution = {
        evaluation: Infinity,
        solutionSet: {},
        feasible: false
    };


    // And here...we...go!

    // Running solver a first time to obtain an initial solution
    tableau.solve();

    // Saving initial solution
    tableau.save();

    // 1.) Load a model into the queue
    var branch = new Branch(-Infinity, []);
    branches.push(branch);

    // If all branches have been exhausted terminate the loop
    while (branches.length > 0) {
        // Get a model from the queue
        branch = branches.pop();

        if (branch.relaxedEvaluation >= bestEvaluation) {
            continue;
        }

        // Solving from initial relaxed solution
        // with additional cut constraints

        // Restoring initial solution
        tableau.restore();

        // Adding cut constraints
        var cuts = branch.cuts;
        tableau.addCutConstraints(cuts);

        // Solving
        tableau.solve();

        // Keep Track of how many cycles
        // we've gone through
        iterations++;

        if (tableau.feasible === false) {
            continue;
        }

        var evaluation = tableau.evaluation;
        // Is the model both integral and feasible?
        if (tableau.isIntegral() === true) {
            // Is the new result the bestSolution that we've ever had?
            if (evaluation < bestEvaluation) {
                // Store the solution as the bestSolution
                bestSolution = tableau.compileSolution();
                bestEvaluation = evaluation;
            }

            // The solution is feasible and interagal;
            // But it is worse than the current solution;
            // Ignore it.
        } else if (evaluation < bestEvaluation) {
            // If the solution is
            //  a. Feasible
            //  b. Better than the current solution
            //  c. but *NOT* integral

            // So the solution isn't integral? How do we solve this.
            // We create 2 new models, that are mirror images of the prior
            // model, with 1 exception.

            // Say we're trying to solve some stupid problem requiring you get
            // animals for your daughter's kindergarten petting zoo party
            // and you have to choose how many ducks, goats, and lambs to get.

            // Say that the optimal solution to this problem if we didn't have
            // to make it integral was {duck: 8, lambs: 3.5}
            //
            // To keep from traumatizing your daughter and the other children
            // you're going to want to have whole animals

            // What we would do is find the most fractional variable (lambs)
            // and create new models from the old models, but with a new constraint
            // on apples. The constraints on the low model would look like:
            // constraints: {...
            //   lamb: {max: 3}
            //   ...
            // }
            //
            // while the constraints on the high model would look like:
            //
            // constraints: {...
            //   lamb: {min: 4}
            //   ...
            // }
            // If neither of these models is feasible because of this constraint,
            // the model is not integral at this point, and fails.

            // Find out where we want to split the solution
            var variable = tableau.getMostFractionalVar();
            // var variable = tableau.getFractionalVarWithLowestCost();
            var varIndex = variable.index;

            var cutsHigh = [];
            var cutsLow = [];

            var nCuts = cuts.length;
            for (var c = 0; c < nCuts; c += 1) {
                var cut = cuts[c];
                if (cut.varIndex === varIndex) {
                    if (cut.type === "min") {
                        cutsLow.push(cut);
                    } else {
                        cutsHigh.push(cut);
                    }
                } else {
                    cutsHigh.push(cut);
                    cutsLow.push(cut);
                }
            }

            var min = Math.ceil(variable.value);
            var max = Math.floor(variable.value);

            var cutHigh = new Cut("min", varIndex, min);
            cutsHigh.push(cutHigh);

            var cutLow = new Cut("max", varIndex, max);
            cutsLow.push(cutLow);

            branches.push(new Branch(evaluation, cutsHigh));
            branches.push(new Branch(evaluation, cutsLow));

            // Sorting branches
            // Branches with the most promising lower bounds
            // will be picked first
            branches.sort(sortByEvaluation);
        }
    }

    // Restoring initial solution
    tableau.restore();

    bestSolution.iter = iterations;
    return bestSolution;
}
module.exports = MILP;

},{}],3:[function(require,module,exports){
/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/

var Tableau = require("./Tableau.js");
var MILP = require("./MILP.js");
var expressions = require("./expressions.js");
var Constraint = expressions.Constraint;
var Equality = expressions.Equality;
var Variable = expressions.Variable;

var Term = expressions.Term;

/*************************************************************
 * Class: Model
 * Description: Holds the model of a linear optimisation problem
 **************************************************************/
function Model(precision, name) {
    this.tableau = new Tableau(precision);

    this.name = name;

    this.variables = [];

    this.variableIds = [];

    this.integerVariables = [];

    this.unrestrictedVariables = {};

    this.constraints = [];

    this.nConstraints = 0;

    this.nVariables = 0;

    this.isMinimization = true;

    // TODO: this.availableIndexes = [];
    this.lastElementIndex = 0;

    this.tableauInitialized = false;
}
module.exports = Model;

Model.prototype.minimize = function () {
    this.isMinimization = true;
    return this;
};

Model.prototype.maximize = function () {
    this.isMinimization = false;
    return this;
};

// Model.prototype.addConstraint = function (constraint) {
//     // TODO: make sure that the constraint does not belong do another model
//     // and make 
//     this.constraints.push(constraint);
//     return this;
// };

Model.prototype._addConstraint = function (constraint) {
    this.constraints.push(constraint);
    this.nConstraints += 1;
    this.lastElementIndex += 1;
    if (this.tableauInitialized === true) {
        this.tableau.addConstraint(constraint);
    }
};

Model.prototype.smallerThan = function (rhs) {
    var constraint = new Constraint(rhs, true, this.lastElementIndex, this);
    this._addConstraint(constraint);
    return constraint;
};

Model.prototype.greaterThan = function (rhs) {
    var constraint = new Constraint(rhs, false, this.lastElementIndex, this);
    this._addConstraint(constraint);
    return constraint;
};

Model.prototype.equal = function (rhs) {
    var constraintUpper = new Constraint(rhs, true, this.lastElementIndex, this);
    this._addConstraint(constraintUpper);

    var constraintLower = new Constraint(rhs, false, this.lastElementIndex, this);
    this._addConstraint(constraintLower);

    return new Equality(constraintUpper, constraintLower);
};

Model.prototype.addVariable = function (cost, id, isInteger, isUnrestricted) {
    // TODO: difficulty undetermined
    // add support for variables that can be negative
    // how: may be by allowing negative pivots? <- should be easy enough
    var varIndex = this.variables.length;
    var variable = new Variable(id, cost, this.lastElementIndex);
    this.variables.push(variable);
    this.variableIds[this.lastElementIndex] = id;

    if (isInteger) {
        this.integerVariables.push(variable);
    }

    if (isUnrestricted) {
        this.unrestrictedVariables[variable.index] = true;
    }

    this.nVariables += 1;
    this.lastElementIndex += 1;

    if (this.tableauInitialized === true) {
        this.tableau.addVariable(variable, cost);
    }

    return variable;
};

//-------------------------------------------------------------------
// For dynamic model modification
//-------------------------------------------------------------------
Model.prototype.removeConstraint = function (constraint) {
    var idx = this.constraints.indexOf(constraint);
    if (idx === -1) {
        console.warn("[Model.removeConstraint] Constraint not present in model");
        return;
    }

    if (this.tableauInitialized === true) {
        if (constraint instanceof Equality === true) {
            this.tableau.removeConstraint(constraint.upperBound);
            this.tableau.removeConstraint(constraint.lowerBound);
        } else {
            this.tableau.removeConstraint(constraint);
        }
    }

    this.constraints.splice(idx, 1);
    this.nConstraints -= 1;
    return this;
};

Model.prototype.removeVariable = function (variable) {
    // TODO ? remove variable term from every constraint?
    // How: every variable should reference the constraints it appears in
    var idx = this.variables.indexOf(variable);
    if (idx === -1) {
        console.warn("[Model.removeVariable] Variable not present in model");
        return;
    }

    if (this.tableauInitialized === true) {
        this.tableau.removeVariable(variable);
    }

    variable.index = -1;
    this.variables.splice(idx, 1);
    return this;
};

Model.prototype.updateRightHandSide = function (constraint, difference) {
    if (this.tableauInitialized === true) {
        this.tableau.updateRightHandSide(constraint, difference);
    }
    return this;
};

Model.prototype.updateConstraintCoefficient = function (constraint, variable, difference) {
    if (this.tableauInitialized === true) {
        this.tableau.updateConstraintCoefficient(constraint, variable, difference);
    }
    return this;
};


Model.prototype.setCost = function (cost, variable) {
    var difference = cost - variable.cost;
    if (this.isMinimization === false) {
        difference = -difference;
    }

    variable.cost = cost;
    this.tableau.updateCost(variable, difference);
    return this;
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Model.prototype.loadJson = function (jsonModel) {
    this.isMinimization = (jsonModel.opType !== "max");

    var variables = jsonModel.variables;
    var constraints = jsonModel.constraints;

    var constraintsMin = {};
    var constraintsMax = {};

    // Instantiating constraints
    var constraintIds = Object.keys(constraints);
    var nConstraintIds = constraintIds.length;

    for (var c = 0; c < nConstraintIds; c += 1) {
        var constraintId = constraintIds[c];
        var constraint = constraints[constraintId];
        var equal = constraint.equal;

        var min = (equal === undefined) ? constraint.min : equal;
        if (min !== undefined) {
            constraintsMin[constraintId] = this.greaterThan(min);
        }

        var max = (equal === undefined) ? constraint.max : equal;
        if (max !== undefined) {
            constraintsMax[constraintId] = this.smallerThan(max);
        }

        if (equal !== undefined) {
            var equality = new Equality(constraintsMin[constraintId], constraintsMax[constraintId]);
            if (constraint.weight !== undefined) {
                equality.relax(constraint.weight);
            }
            continue;
        }
    }

    var variableIds = Object.keys(variables);
    var nVariables = variableIds.length;

    var integerVarIds = jsonModel.ints || {};
    var unrestrictedVarIds = jsonModel.unrestricted || {};

    // Instantiating variables and constraint terms
    var objectiveName = jsonModel.optimize;
    for (var v = 0; v < nVariables; v += 1) {
        // Creation of the variables
        var variableId = variableIds[v];
        var variableConstraints = variables[variableId];
        var cost = variableConstraints[objectiveName] || 0;
        var isInteger = !!integerVarIds[variableId];
        var isUnrestricted = !!unrestrictedVarIds[variableId];
        var variable = this.addVariable(cost, variableId, isInteger, isUnrestricted);

        var constraintNames = Object.keys(variableConstraints);
        for (c = 0; c < constraintNames.length; c += 1) {
            var constraintName = constraintNames[c];
            if (constraintName === objectiveName) {
                continue;
            }

            var coefficient = variableConstraints[constraintName];

            var constraintMin = constraintsMin[constraintName];
            if (constraintMin !== undefined) {
                constraintMin.addTerm(coefficient, variable);
            }

            var constraintMax = constraintsMax[constraintName];
            if (constraintMax !== undefined) {
                constraintMax.addTerm(coefficient, variable);
            }
        }
    }

    return this;
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Model.prototype.getNumberOfIntegerVariables = function () {
    return this.integerVariables.length;
};

Model.prototype.solve = function () {
    // Setting tableau if not done
    if (this.tableauInitialized === false) {
        this.tableau.setModel(this);
        this.tableauInitialized = true;
    }

    if (this.getNumberOfIntegerVariables() > 0) {
        return MILP(this);
    } else {
        var solution = this.tableau.solve().compileSolution();
        return solution;
    }
};

Model.prototype.compileSolution = function () {
    return this.tableau.compileSolution();
};

Model.prototype.isFeasible = function () {
    return this.tableau.feasible;
};

Model.prototype.save = function () {
    return this.tableau.save();
};

Model.prototype.restore = function () {
    return this.tableau.restore();
};

Model.prototype.log = function (message) {
    return this.tableau.log(message);
};

},{"./MILP.js":2,"./Tableau.js":5,"./expressions.js":7}],4:[function(require,module,exports){
/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/

    /***************************************************************
     * Method: polyopt
     * Scope: private
     * Agruments:
     *        model: The model we want solver to operate on.
                     Because we're in here, we're assuming that
                     we're solving a multi-objective optimization
                     problem. Poly-Optimization. polyopt.

                     This model has to be formed a little differently
                     because it has multiple objective functions.
                     Normally, a model has 2 attributes: opType (string,
                     "max" or "min"), and optimize (string, whatever
                     attribute we're optimizing.

                     Now, there is no opType attribute on the model,
                     and optimize is an object of attributes to be
                     optimized, and how they're to be optimized.
                     For example:

                     ...
                     "optimize": {
                        "pancakes": "max",
                        "cost": "minimize"
                     }
                     ...


     **************************************************************/

module.exports = function(solver, model, detail){

    // I have no idea if this is actually works, or what,
    // but here is my algorithm to solve linear programs
    // with multiple objective functions

    // 1. Optimize for each constraint
    // 2. The results for each solution is a vector
    //    representing a vertex on the polytope we're creating
    // 3. The results for all solutions describes the shape
    //    of the polytope (would be nice to have the equation
    //    representing this)
    // 4. Find the mid-point between all vertices by doing the
    //    following (a_1 + a_2 ... a_n) / n;
    var objectives = model.optimize,
        new_constraints = JSON.parse(JSON.stringify(model.optimize)),
        keys = Object.keys(model.optimize),
        tmp,
        counter = 0,
        vectors = {},
        vector_key = "",
        obj = {},
        pareto = [],
        i,j,x,y,z;

    // Delete the optimize object from the model
    delete model.optimize;

    // Iterate and Clear
    for(i = 0; i < keys.length; i++){
        // Clean up the new_constraints
        new_constraints[keys[i]] = 0;
    }

    // Solve and add
    for(i = 0; i < keys.length; i++){

        // Prep the model
        model.optimize = keys[i];
        model.opType = objectives[keys[i]];

        // solve the model
        tmp = solver.Solve(model, undefined, undefined, true);

        // Only the variables make it into the solution;
        // not the attributes.
        //
        // Because of this, we have to add the attributes
        // back onto the solution so we can do math with
        // them later...

        // Loop over the keys
        for(y in keys){
            // We're only worried about attributes, not variables
            if(!model.variables[keys[y]]){
                // Create space for the attribute in the tmp object
                tmp[keys[y]] = tmp[keys[y]] ? tmp[keys[y]] : 0;
                // Go over each of the variables
                for(x in model.variables){
                    // Does the variable exist in tmp *and* does attribute exist in this model?
                    if(model.variables[x][keys[y]] && tmp[x]){
                        // Add it to tmp
                        tmp[keys[y]] += tmp[x] * model.variables[x][keys[y]];
                    }
                }
            }
        }

        // clear our key
        vector_key = "base";
        // this makes sure that if we get
        // the same vector more than once,
        // we only count it once when finding
        // the midpoint
        for(j = 0; j < keys.length; j++){
            if(tmp[keys[j]]){
                vector_key += "-" + ((tmp[keys[j]] * 1000) | 0) / 1000;
            } else {
                vector_key += "-0";
            }
        }

        // Check here to ensure it doesn't exist
        if(!vectors[vector_key]){
            // Add the vector-key in
            vectors[vector_key] = 1;
            counter++;
            
            // Iterate over the keys
            // and update our new constraints
            for(j = 0; j < keys.length; j++){
                if(tmp[keys[j]]){
                    new_constraints[keys[j]] += tmp[keys[j]];
                }
            }
            
            // Push the solution into the paretos
            // array after cleaning it of some
            // excess data markers
            
            delete tmp.feasible;
            delete tmp.result;            
            pareto.push(tmp);
        }
    }

    // Trying to find the mid-point
    // divide each constraint by the
    // number of constraints
    // *midpoint formula*
    // (x1 + x2 + x3) / 3
    for(i = 0; i < keys.length; i++){
        model.constraints[keys[i]] = {"equal": new_constraints[keys[i]] / counter};
    }

    // Give the model a fake thing to optimize on
    model.optimize = "cheater-" + Math.random();
    model.opType = "max";

    // And add the fake attribute to the variables
    // in the model
    for(i in model.variables){
        model.variables[i].cheater = 1;
    }
    
    
    console.log(model);
    // Build out the detail if its requested
    // otherwise, this is just burning cycles...
    if(detail){
        // Build out the object with all attributes
        for(i in pareto){
            for(x in pareto[i]){
                obj[x] = obj[x] || {min: 1e99, max: -1e99};
            }
        }
        
        // Give each pareto a full attribute list
        // while getting the max and min values
        // for each attribute
        for(i in obj){
            for(x in pareto){
                if(pareto[x][i]){
                    if(pareto[x][i] > obj[i].max){
                        obj[i].max = pareto[x][i];
                    } 
                    if(pareto[x][i] < obj[i].min){
                        obj[i].min = pareto[x][i];
                    }
                } else {
                    pareto[x][i] = 0;
                    obj[i].min = 0;
                }
            }
        }
        // Solve the model for the midpoints
        tmp =  solver.Solve(model, undefined, undefined, true);
        
        return {
            midpoint: tmp,
            pareto: pareto,
            ranges: obj
        };    
    } else {
        // Just return the result of the mid-point formula
        return solver.Solve(model, undefined, undefined, true);
    }
};

},{}],5:[function(require,module,exports){
/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/

/*************************************************************
 * Class: Tableau
 * Description: Simplex tableau, holding a the tableau matrix
 *              and all the information necessary to perform
 *              the simplex algorithm
 * Agruments:
 *        precision: If we're solving a MILP, how tight
 *                   do we want to define an integer, given
 *                   that 20.000000000000001 is not an integer.
 *                   (defaults to 1e-8)
 **************************************************************/
function Tableau(precision) {
    this.model = null;

    this.matrix = null;
    this.width = 0;
    this.height = 0;

    this.costRowIndex = 0;
    this.rhsColumn = 0;

    this.variableIds = null;
    this.unrestrictedVars = null;

    // Solution attributes
    this.feasible = true; // until proven guilty
    this.evaluation = 0;

    this.basicIndexes = null;
    this.nonBasicIndexes = null;

    this.rows = null;
    this.cols = null;

    this.precision = precision || 1e-8;

    this.savedState = null;
}
module.exports = Tableau;

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Tableau.prototype.initialize = function (width, height, variableIds, unrestrictedVars) {
    this.variableIds = variableIds;
    this.unrestrictedVars = unrestrictedVars;

    this.width = width;
    this.height = height;

    // BUILD AN EMPTY ARRAY OF THAT WIDTH
    var tmpRow = new Array(width);
    for (var i = 0; i < width; i++) {
        tmpRow[i] = 0;
    }

    // BUILD AN EMPTY TABLEAU
    this.matrix = new Array(height);
    for (var j = 0; j < height; j++) {
        this.matrix[j] = tmpRow.slice();
    }

    this.basicIndexes = new Array(this.height);
    this.nonBasicIndexes = new Array(this.width);

    this.basicIndexes[0] = -1;
    this.nonBasicIndexes[0] = -1;

    this.nVars = width + height - 2;
    this.rows = new Array(this.nVars);
    this.cols = new Array(this.nVars);
};

//-------------------------------------------------------------------
// Function: solve
// Detail: Main function, linear programming solver
//-------------------------------------------------------------------
Tableau.prototype.solve = function () {
    // Execute Phase 1 to obtain a Basic Feasible Solution (BFS)
    this.phase1();

    // Execute Phase 2
    if (this.feasible === true) {
        // Running simplex on Initial Basic Feasible Solution (BFS)
        // N.B current solution is feasible
        this.phase2();
    }

    return this;
};

function Solution(evaluation, solutionSet, feasible) {
    this.evaluation = evaluation;
    this.solutionSet = solutionSet;
    this.feasible = feasible;
}

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Tableau.prototype.compileSolution = function () {
    var solutionSet = {};

    var lastRow = this.height - 1;
    var roundingCoeff = Math.round(1 / this.precision);
    for (var r = 1; r <= lastRow; r += 1) {
        var varIndex = this.basicIndexes[r];
        var variableId = this.variableIds[varIndex];
        if (variableId !== undefined) {
            var varValue = this.matrix[r][this.rhsColumn];
            solutionSet[variableId] =
                Math.round(varValue * roundingCoeff) / roundingCoeff;
        }
    }

    var evaluation = (this.model.isMinimization === true) ?
        this.evaluation : -this.evaluation;

    return new Solution(evaluation, solutionSet, this.feasible);
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Tableau.prototype.isIntegral = function () {
    var integerVariables = this.model.integerVariables;

    var nIntegerVars = integerVariables.length;
    for (var v = 0; v < nIntegerVars; v++) {
        var varRow = this.rows[integerVariables[v].index];
        if (varRow === -1) {
            continue;
        }

        var varValue = this.matrix[varRow][this.rhsColumn];
        if (Math.abs(varValue - Math.round(varValue)) > this.precision) {
            return false;
        }
    }
    return true;
};

function VariableData(index, value) {
    this.index = index;
    this.value = value;
}

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Tableau.prototype.getMostFractionalVar = function () {
    var biggestFraction = 0;
    var selectedVarIndex = null;
    var selectedVarValue = null;
    var mid = 0.5;

    var integerVariables = this.model.integerVariables;
    var nIntegerVars = integerVariables.length;
    for (var v = 0; v < nIntegerVars; v++) {
        var varIndex = integerVariables[v].index;
        var varRow = this.rows[varIndex];
        if (varRow === -1) {
            continue;
        }

        var varValue = this.matrix[varRow][this.rhsColumn];
        var fraction = Math.abs(varValue - Math.round(varValue));
        if (biggestFraction < fraction) {
            biggestFraction = fraction;
            selectedVarIndex = varIndex;
            selectedVarValue = varValue;
        }
    }

    return new VariableData(selectedVarIndex, selectedVarValue);
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Tableau.prototype.getFractionalVarWithLowestCost = function () {
    var highestCost = Infinity;
    var selectedVarIndex = null;
    var selectedVarValue = null;

    var integerVariables = this.model.integerVariables;
    var nIntegerVars = integerVariables.length;
    for (var v = 0; v < nIntegerVars; v++) {
        var variable = integerVariables[v];
        var varIndex = variable.index;
        var varRow = this.rows[varIndex];
        if (varRow === -1) {
            // Variable value is non basic
            // its value is 0
            continue;
        }

        var varValue = this.matrix[varRow][this.rhsColumn];
        if (Math.abs(varValue - Math.round(varValue)) > this.precision) {
            var cost = variable.cost;
            if (highestCost > cost) {
                highestCost = cost;
                selectedVarIndex = varIndex;
                selectedVarValue = varValue;
            }
        }
    }

    return new VariableData(selectedVarIndex, selectedVarValue);
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Tableau.prototype.setEvaluation = function () {
    // Rounding objective value
    var roundingCoeff = Math.round(1 / this.precision);
    var evaluation = this.matrix[this.costRowIndex][this.rhsColumn];
    this.evaluation =
        Math.round(evaluation * roundingCoeff) / roundingCoeff;
};

//-------------------------------------------------------------------
// Description: Convert a non standard form tableau
//              to a standard form tableau by eliminating
//              all negative values in the Right Hand Side (RHS)
//              This results in a Basic Feasible Solution (BFS)
//
//-------------------------------------------------------------------
Tableau.prototype.phase1 = function () {
    var matrix = this.matrix;
    var rhsColumn = this.rhsColumn;
    var lastColumn = this.width - 1;
    var lastRow = this.height - 1;

    var unrestricted;
    var iterations = 0;
    while (true) {
        // Selecting leaving variable (feasibility condition):
        // Basic variable with most negative value
        var leavingRowIndex = 0;
        var rhsValue = -this.precision;
        for (var r = 1; r <= lastRow; r++) {
            unrestricted = this.unrestrictedVars[this.basicIndexes[r]] === true;
            if (unrestricted) {
                continue;
            }

            var value = matrix[r][rhsColumn];
            if (value < rhsValue) {
                rhsValue = value;
                leavingRowIndex = r;
            }
        }

        // If nothing is strictly smaller than 0; we're done with phase 1.
        if (leavingRowIndex === 0) {
            // Feasible, champagne!
            this.feasible = true;
            return iterations;
        }

        // Selecting entering variable
        var enteringColumn = 0;
        var maxQuotient = -Infinity;
        var costRow = matrix[0];
        var leavingRow = matrix[leavingRowIndex];
        for (var c = 1; c <= lastColumn; c++) {
            var colValue = leavingRow[c];
            if (-this.precision < colValue && colValue < this.precision) {
                continue;
            }

            unrestricted = this.unrestrictedVars[this.nonBasicIndexes[c]] === true;
            if (unrestricted || colValue < -this.precision) {
                var quotient = -costRow[c] / colValue;
                if (maxQuotient < quotient) {
                    maxQuotient = quotient;
                    enteringColumn = c;
                }
            }
        }

        if (enteringColumn === 0) {
            // Not feasible
            this.feasible = false;
            return iterations;
        }

        this.pivot(leavingRowIndex, enteringColumn);
        iterations += 1;
    }
};

//-------------------------------------------------------------------
// Description: Apply simplex to obtain optimal soltuion
//              used as phase2 of the simplex
//
//-------------------------------------------------------------------
Tableau.prototype.phase2 = function () {
    var matrix = this.matrix;
    var rhsColumn = this.rhsColumn;
    var lastColumn = this.width - 1;
    var lastRow = this.height - 1;

    var precision = this.precision;

    var iterations = 0;
    while (true) {
        var costRow = matrix[this.costRowIndex];

        // Selecting entering variable (optimality condition)
        var enteringColumn = 0;
        var enteringValue = this.precision;
        var isNegative = false;
        for (var c = 1; c <= lastColumn; c++) {
            var value = costRow[c];
            var unrestricted = this.unrestrictedVars[this.nonBasicIndexes[c]] === true;
            if (unrestricted && value < 0) {
                if (-value > enteringValue) {
                    enteringValue = -value;
                    enteringColumn = c;
                    isNegative = true;
                }
            }

            if (value > enteringValue) {
                enteringValue = value;
                enteringColumn = c;
                isNegative = false;
            }
        }

        // If nothing is greater than 0; we're done with phase 2.
        if (enteringColumn === 0) {
            this.setEvaluation();
            return;
        }

        // Selecting leaving variable
        var leavingRow = 0;
        var minQuotient = Infinity;

        for (var r = 1; r <= lastRow; r++) {
            var row = matrix[r];
            var rhsValue = row[rhsColumn];
            var colValue = row[enteringColumn];

            if (-precision < colValue && colValue < precision) {
                continue;
            }

            if (colValue > 0 && precision > rhsValue && rhsValue > -precision) {
                minQuotient = 0;
                leavingRow = r;
                break;
            }

            var quotient = isNegative ? -rhsValue / colValue : rhsValue / colValue;
            if (quotient > 0 && minQuotient > quotient) {
                minQuotient = quotient;
                leavingRow = r;
            }
        }

        if (minQuotient === Infinity) {
            // TODO: solution is not bounded
            // optimal value is -Infinity
            this.evaluation = -Infinity;
            return;
        }

        this.pivot(leavingRow, enteringColumn, true);
        iterations += 1;
    }
};

// Array holding the column indexes for which the value is not null
// on the pivot row
// Shared by all tableaux for smaller overhead and lower memory usage
var nonZeroColumns = [];
//-------------------------------------------------------------------
// Description: Execute pivot operations over a 2d array,
//          on a given row, and column
//
//-------------------------------------------------------------------
Tableau.prototype.pivot = function (pivotRowIndex, pivotColumnIndex, debug) {
    var matrix = this.matrix;
    var quotient = matrix[pivotRowIndex][pivotColumnIndex];

    var lastRow = this.height - 1;
    var lastColumn = this.width - 1;

    var leavingBasicIndex = this.basicIndexes[pivotRowIndex];
    var enteringBasicIndex = this.nonBasicIndexes[pivotColumnIndex];

    this.basicIndexes[pivotRowIndex] = enteringBasicIndex;
    this.nonBasicIndexes[pivotColumnIndex] = leavingBasicIndex;

    this.rows[enteringBasicIndex] = pivotRowIndex;
    this.rows[leavingBasicIndex] = -1;

    this.cols[enteringBasicIndex] = -1;
    this.cols[leavingBasicIndex] = pivotColumnIndex;

    // Divide everything in the target row by the element @
    // the target column
    var pivotRow = matrix[pivotRowIndex];
    var nNonZeroColumns = 0;
    for (var c = 0; c <= lastColumn; c++) {
        if (pivotRow[c] !== 0) {
            pivotRow[c] /= quotient;
            nonZeroColumns[nNonZeroColumns] = c;
            nNonZeroColumns += 1;
        }
    }
    pivotRow[pivotColumnIndex] = 1 / quotient;

    // for every row EXCEPT the pivot row,
    // set the value in the pivot column = 0 by
    // multiplying the value of all elements in the objective
    // row by ... yuck... just look below; better explanation later
    var precision = this.precision;
    for (var r = 0; r <= lastRow; r++) {
        var row = matrix[r];
        if (r !== pivotRowIndex) {
            var coefficient = row[pivotColumnIndex];
            // No point Burning Cycles if
            // Zero to the thing
            if (coefficient !== 0) {
                for (var i = 0; i < nNonZeroColumns; i++) {
                    c = nonZeroColumns[i];
                    // No point in doing math if you're just adding
                    // Zero to the thing
                    var v0 = pivotRow[c];
                    if (v0 !== 0) {
                        row[c] = row[c] - coefficient * v0;
                    }
                }

                row[pivotColumnIndex] = -coefficient / quotient;
            }
        }
    }
};

Tableau.prototype.copy = function () {
    var copy = new Tableau(this.precision);

    copy.width = this.width;
    copy.height = this.height;

    copy.nVars = this.nVars;
    copy.model = this.model;

    // Making a shallow copy of integer variable indexes
    // and variable ids
    copy.integerIndexes = this.integerIndexes;
    copy.variableIds = this.variableIds;
    copy.unrestrictedVars = this.unrestrictedVars;

    // All the other arrays are deep copied
    copy.basicIndexes = this.basicIndexes.slice();
    copy.nonBasicIndexes = this.nonBasicIndexes.slice();

    copy.rows = this.rows.slice();
    copy.cols = this.cols.slice();


    var matrix = this.matrix;
    var matrixCopy = new Array(this.height);
    for (var r = 0; r < this.height; r++) {
        matrixCopy[r] = matrix[r].slice();
    }

    copy.matrix = matrixCopy;

    return copy;
};

Tableau.prototype.save = function () {
    this.savedState = this.copy();
};

Tableau.prototype.restore = function () {
    if (this.savedState === null) {
        console.warn("[Tableau.restore] No saved state!");
        return;
    }

    var save = this.savedState;
    var savedMatrix = save.matrix;
    this.nVars = save.nVars;
    this.model = save.model;
    this.variableIds = save.variableIds;
    this.integerIndexes = save.integerIndexes;
    this.unrestrictedVars = save.unrestrictedVars;

    this.width = save.width;
    this.height = save.height;

    // Restoring matrix
    var r, c;
    for (r = 0; r < this.height; r += 1) {
        var savedRow = savedMatrix[r];
        var row = this.matrix[r];
        for (c = 0; c < this.width; c += 1) {
            row[c] = savedRow[c];
        }
    }

    // Restoring all the other structures
    var savedBasicIndexes = save.basicIndexes;
    for (c = 0; c < this.height; c += 1) {
        this.basicIndexes[c] = savedBasicIndexes[c];
    }

    while (this.basicIndexes.length > this.height) {
        this.basicIndexes.pop();
    }

    var savedNonBasicIndexes = save.nonBasicIndexes;
    for (r = 0; r < this.width; r += 1) {
        this.nonBasicIndexes[r] = savedNonBasicIndexes[r];
    }

    while (this.nonBasicIndexes.length > this.width) {
        this.nonBasicIndexes.pop();
    }

    var savedRows = save.rows;
    var savedCols = save.cols;
    for (var v = 0; v < this.nVars; v += 1) {
        this.rows[v] = savedRows[v];
        this.cols[v] = savedCols[v];
    }
};

Tableau.prototype.addCutConstraints = function (cutConstraints) {
    var nCutConstraints = cutConstraints.length;

    var height = this.model.nConstraints + 1;
    var heightWithCuts = height + nCutConstraints;

    // Adding rows to hold cut constraints
    for (var h = height; h < heightWithCuts; h += 1) {
        if (this.matrix[h] === undefined) {
            this.matrix[h] = this.matrix[h - 1].slice();
        }
    }

    // Adding cut constraints
    this.height = heightWithCuts;
    this.nVars = this.width + this.height - 2;

    var c;
    var lastColumn = this.width - 1;
    for (var i = 0; i < nCutConstraints; i += 1) {
        var cut = cutConstraints[i];

        // Constraint row index
        var r = height + i;

        var sign = (cut.type === "min") ? -1 : 1;

        // Variable on which the cut is applied
        var varIndex = cut.varIndex;
        var varRowIndex = this.rows[varIndex];
        var constraintRow = this.matrix[r];
        if (varRowIndex === -1) {
            // Variable is non basic
            constraintRow[this.rhsColumn] = sign * cut.value;
            for (c = 1; c <= lastColumn; c += 1) {
                constraintRow[c] = 0;
            }
            constraintRow[this.cols[varIndex]] = sign;
        } else {
            // Variable is basic
            var varRow = this.matrix[varRowIndex];
            var varValue = varRow[this.rhsColumn];
            constraintRow[this.rhsColumn] = sign * (cut.value - varValue);
            for (c = 1; c <= lastColumn; c += 1) {
                constraintRow[c] = -sign * varRow[c];
            }
        }

        // Creating slack variable
        var slackVarIndex = lastColumn + r - 1;
        this.basicIndexes[r] = slackVarIndex;

        this.rows[slackVarIndex] = r;
        this.cols[slackVarIndex] = -1;
    }
};

Tableau.prototype.density = function () {
    var density = 0;

    var matrix = this.matrix;
    for (var r = 0; r < this.height; r++) {
        var row = matrix[r];
        for (var c = 0; c < this.width; c++) {
            if (row[c] !== 0) {
                density += 1;
            }
        }
    }

    return density / (this.height * this.width);
};

Tableau.prototype._putInBase = function (varIndex) {
    // Is varIndex in the base?
    var r = this.rows[varIndex];
    if (r === -1) {
        // Outside the base
        // pivoting to take it out
        var c = this.cols[varIndex];

        // Selecting pivot row
        // (Any row with coefficient different from 0)
        for (var r1 = 1; r1 < this.height; r1 += 1) {
            var coefficient = this.matrix[r1][c];
            if (coefficient < -this.precision || this.precision < coefficient) {
                r = r1;
                break;
            }
        }

        this.pivot(r, c);
    }

    return r;
};

Tableau.prototype._takeOutOfBase = function (varIndex) {
    // Is varIndex in the base?
    var c = this.cols[varIndex];
    if (c === -1) {
        // Inside the base
        // pivoting to take it out
        var r = this.rows[varIndex];

        // Selecting pivot column
        // (Any column with coefficient different from 0)
        var pivotRow = this.matrix[r];
        for (var c1 = 1; c1 < this.height; c1 += 1) {
            var coefficient = pivotRow[c1];
            if (coefficient < -this.precision || this.precision < coefficient) {
                c = c1;
                break;
            }
        }

        this.pivot(r, c);
    }

    return c;
};

Tableau.prototype.updateRightHandSide = function (constraint, difference) {
    // Updates RHS of given constraint
    var lastRow = this.height - 1;
    var constraintRow = this.rows[constraint.index];
    if (constraintRow === -1) {
        // Slack is not in base
        var slackColumn = this.cols[constraint.index];

        // Upading all the RHS values
        for (var r = 0; r <= lastRow; r += 1) {
            var row = this.matrix[r];
            row[this.rhsColumn] -= difference * row[slackColumn];
        }
    } else {
        // Slack variable of constraint is in base
        // Updating RHS with the difference between the old and the new one
        this.matrix[constraintRow][this.rhsColumn] -= difference;
    }
};

Tableau.prototype.updateConstraintCoefficient = function (constraint, variable, difference) {
    // Updates variable coefficient within a constraint
    // TODO: optimize, can be a little heavy (no more than one pivot necessary)

    // Putting the constraint in the base
    var r = this._putInBase(constraint.index);

    // Putting the variable out of the base
    var c = this._takeOutOfBase(variable.index);

    // Updating coefficient with the difference
    // between the old and the new one
    this.matrix[r][c] -= difference;
};

Tableau.prototype.updateCost = function (variable, difference) {
    // Updates variable coefficient within the objective function
    var varIndex = variable.index;
    var lastColumn = this.width - 1;
    var varColumn = this.cols[varIndex];
    if (varColumn === -1) {
        // Variable is in base
        var variableRow = this.matrix[this.rows[varIndex]];
        var costRow = this.matrix[0];

        // Upading all the objective values
        for (var c = 0; c <= lastColumn; c += 1) {
            costRow[c] += difference * variableRow[c];
        }
    } else {
        // Variable is not in the base
        // Updating coefficient with difference
        this.matrix[0][varColumn] -= difference;
    }
};

Tableau.prototype.addConstraint = function (constraint) {
    // Adds a constraint to the tableau
    var sign = constraint.isUpperBound ? 1 : -1;
    var lastRow = this.height;

    var constraintRow = this.matrix[lastRow];
    if (constraintRow === undefined) {
        constraintRow = this.matrix[0].slice();
        this.matrix[lastRow] = constraintRow;
    }

    // Setting all row cells to 0
    var lastColumn = this.width - 1;
    for (var c = 0; c <= lastColumn; c += 1) {
        constraintRow[c] = 0;
    }

    // Initializing RHS
    constraintRow[this.rhsColumn] = sign * constraint.rhs;

    var terms = constraint.terms;
    var nTerms = terms.length;
    for (var t = 0; t < nTerms; t += 1) {
        var term = terms[t];
        var coefficient = term.coefficient;
        var varIndex = term.variable.index;

        var varRowIndex = this.rows[varIndex];
        if (varRowIndex === -1) {
            // Variable is non basic
            constraintRow[this.cols[varIndex]] += sign * coefficient;
        } else {
            // Variable is basic
            var varRow = this.matrix[varRowIndex];
            var varValue = varRow[this.rhsColumn];
            for (c = 0; c <= lastColumn; c += 1) {
                constraintRow[c] -= sign * coefficient * varRow[c];
            }
        }
    }

    // Creating slack variable
    var slackIndex = constraint.index;
    this.basicIndexes[lastRow] = slackIndex;

    this.rows[slackIndex] = lastRow;
    this.cols[slackIndex] = -1;

    this.height += 1;
};

Tableau.prototype.removeConstraint = function (constraint) {
    var slackIndex = constraint.index;
    var lastRow = this.height - 1;

    // Putting the constraint in the base
    var r = this._putInBase(slackIndex);

    // Removing constraint
    // by putting the corresponding row at the bottom of the matrix
    // and virtually reducing the height of the matrix by 1
    var tmpRow = this.matrix[lastRow];
    this.matrix[lastRow] = this.matrix[r];
    this.matrix[r] = tmpRow;

    // Removing associated slack variable from basic variables
    this.basicIndexes[slackIndex] = -1;
    this.rows[slackIndex] = -1;

    this.height -= 1;
};


Tableau.prototype.addVariable = function (variable, cost) {
    // Adds a variable to the tableau
    // var sign = constraint.isUpperBound ? 1 : -1;

    var lastRow = this.height - 1;
    var lastColumn = this.width;

    // Setting objective coefficient
    if (this.model.isMinimization === true) {
        this.matrix[0][lastColumn] = -cost;
    } else {
        this.matrix[0][lastColumn] = cost;
    }

    // Setting all other column cells to 0
    for (var r = 1; r <= lastRow; r += 1) {
        this.matrix[r][lastColumn] = 0;
    }

    // Adding variable to trackers
    var varIndex = variable.index;
    this.nonBasicIndexes[lastColumn] = varIndex;

    this.rows[varIndex] = -1;
    this.cols[varIndex] = lastColumn;

    this.width += 1;
};


Tableau.prototype.removeVariable = function (variable) {
    var varIndex = variable.index;

    // Putting the variable out of the base
    var c = this._takeOutOfBase(varIndex);

    var lastColumn = this.width - 1;
    if (c !== lastColumn) {
        var lastRow = this.height - 1;
        for (var r = 0; r <= lastRow; r += 1) {
            var row = this.matrix[r];
            var tmp = row[lastColumn];
            row[lastColumn] = row[c];
            row[c] = tmp;
        }

        var switchVarIndex = this.nonBasicIndexes[lastColumn];
        this.nonBasicIndexes[c] = switchVarIndex;
        this.cols[switchVarIndex] = c;
    }

    // Removing variable from non basic variables
    this.nonBasicIndexes[lastColumn] = -1;
    this.cols[varIndex] = -1;

    this.width -= 1;
};

Tableau.prototype._resetMatrix = function () {
    var variables = this.model.variables;
    var constraints = this.model.constraints;

    var nVars = variables.length;
    var nConstraints = constraints.length;

    var v, varIndex;
    var costRow = this.matrix[0];
    if (this.model.isMinimization === true) {
        for (v = 0; v < nVars; v += 1) {
            costRow[v + 1] = -variables[v].cost;
        }
    } else {
        for (v = 0; v < nVars; v += 1) {
            costRow[v + 1] = variables[v].cost;
        }
    }

    for (v = 0; v < nVars; v += 1) {
        varIndex = variables[v].index;
        this.rows[varIndex] = -1;
        this.cols[varIndex] = v + 1;
        this.nonBasicIndexes[v + 1] = varIndex;
    }

    var rowIndex = 1;
    for (var c = 0; c < nConstraints; c += 1) {
        var constraint = constraints[c];

        var constraintIndex = constraint.index;
        this.rows[constraintIndex] = rowIndex;
        this.cols[constraintIndex] = -1;
        this.basicIndexes[rowIndex] = constraintIndex;

        var t, term, column;
        var terms = constraint.terms;
        var nTerms = terms.length;
        var row = this.matrix[rowIndex++];
        if (constraint.isUpperBound) {
            for (t = 0; t < nTerms; t += 1) {
                term = terms[t];
                column = this.cols[term.variable.index];
                row[column] = term.coefficient;
            }

            row[0] = constraint.rhs;
        } else {
            for (t = 0; t < nTerms; t += 1) {
                term = terms[t];
                column = this.cols[term.variable.index];
                row[column] = -term.coefficient;
            }

            row[0] = -constraint.rhs;
        }
    }
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Tableau.prototype.setModel = function (model) {
    this.model = model;

    var width = model.nVariables + 1;
    var height = model.nConstraints + 1;

    this.initialize(width, height, model.variableIds, model.unrestrictedVariables);
    this._resetMatrix();
    return this;
};


//-------------------------------------------------------------------
// Description: Display a tableau matrix
//              and additional tableau information
//
//-------------------------------------------------------------------
Tableau.prototype.log = function (message, force) {
    if (false && !force) {
        return;
    }

    console.log("****", message, "****");
    console.log("Nb Variables", this.width - 1);
    console.log("Nb Constraints", this.height - 1);
    console.log("Variable Ids", this.variableIds);
    console.log("Basic Indexes", this.basicIndexes);
    console.log("Non Basic Indexes", this.nonBasicIndexes);
    console.log("Rows", this.rows);
    console.log("Cols", this.cols);

    // Variable declaration
    var varNameRowString = "",
        spacePerColumn = [" "],
        j,
        c,
        s,
        r,
        varIndex,
        varName,
        varNameLength,
        nSpaces,
        valueSpace,
        nameSpace;

    var row,
        rowString;

    for (c = 1; c < this.width; c += 1) {
        varIndex = this.nonBasicIndexes[c];
        varName = this.variableIds[varIndex];
        if (varName === undefined) {
            varName = "s" + varIndex;
        }

        varNameLength = varName.length;
        nSpaces = Math.abs(varNameLength - 5);
        valueSpace = " ";
        nameSpace = " ";

        for (s = 0; s < nSpaces; s += 1) {
            if (varNameLength > 5) {
                valueSpace += " ";
            } else {
                nameSpace += " ";
            }
        }
        spacePerColumn[c] = valueSpace;

        varNameRowString += nameSpace + varName;
    }
    console.log(varNameRowString);

    var signSpace;

    // Displaying objective
    var firstRow = this.matrix[this.costRowIndex];
    var firstRowString = "";
    for (j = 1; j < this.width; j += 1) {
        signSpace = firstRow[j] < 0 ? "" : " ";
        firstRowString += signSpace;
        firstRowString += spacePerColumn[j];
        firstRowString += firstRow[j].toFixed(2);
    }
    signSpace = firstRow[0] < 0 ? "" : " ";
    firstRowString += signSpace + spacePerColumn[0] +
        firstRow[0].toFixed(2);
    console.log(firstRowString + " Z");

    // Then the basic variable rows
    for (r = 1; r < this.height; r += 1) {
        row = this.matrix[r];
        rowString = "";
        for (c = 1; c < this.width; c += 1) {
            signSpace = row[c] < 0 ? "" : " ";
            rowString += signSpace + spacePerColumn[c] + row[c].toFixed(
                2);
        }
        signSpace = row[0] < 0 ? "" : " ";
        rowString += signSpace + spacePerColumn[0] + row[0].toFixed(
            2);

        varIndex = this.basicIndexes[r];
        varName = this.variableIds[varIndex];
        if (varName === undefined) {
            varName = "s" + varIndex;
        }
        console.log(rowString + " " + varName);
    }
    console.log("");

    return this;
};

},{}],6:[function(require,module,exports){
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

},{}],7:[function(require,module,exports){
/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/

//-------------------------------------------------------------------
//-------------------------------------------------------------------
function Variable(id, cost, index) {
    this.id = id;
    this.cost = cost;
    this.index = index;
    this.value = 0;
}

//-------------------------------------------------------------------
//-------------------------------------------------------------------
function Term(variable, coefficient) {
    this.variable = variable;
    this.coefficient = coefficient;
}

//-------------------------------------------------------------------
//-------------------------------------------------------------------
function Constraint(rhs, isUpperBound, index, model) {
    this.index = index;
    this.model = model;
    this.rhs = rhs;
    this.isUpperBound = isUpperBound;

    this.terms = [];
    this.termsByVarIndex = {};
}

Constraint.prototype.addTerm = function (coefficient, variable) {
    var varIndex = variable.index;
    var term = this.termsByVarIndex[varIndex];
    if (term === undefined) {
        // No term for given variable
        term = new Term(variable, coefficient);
        this.termsByVarIndex[varIndex] = term;
        this.terms.push(term);
        if (this.isUpperBound === true) {
            coefficient = -coefficient;
        }
        this.model.updateConstraintCoefficient(this, variable, coefficient);
    } else {
        // Term for given variable already exists
        // updating its coefficient
        var newCoefficient = term.coefficient + coefficient;
        this.setVariableCoefficient(newCoefficient, variable);
    }

    return this;
};

Constraint.prototype.removeTerm = function (term) {
    // TODO
    return this;
};

Constraint.prototype.setRightHandSide = function (newRhs) {
    if (newRhs !== this.rhs) {
        var difference = newRhs - this.rhs;
        if (this.isUpperBound === true) {
            difference = -difference;
        }

        this.rhs = newRhs;
        this.model.updateRightHandSide(this, difference);
    }

    return this;
};

Constraint.prototype.setVariableCoefficient = function (newCoefficient, variable) {
    var varIndex = variable.index;
    if (varIndex === -1) {
        console.warn("[Constraint.setVariableCoefficient] Trying to change coefficient of inexistant variable.");
        return;
    }

    var term = this.termsByVarIndex[varIndex];
    if (term === undefined) {
        // No term for given variable
        this.addTerm(newCoefficient, variable);
    } else {
        // Term for given variable already exists
        // updating its coefficient if changed
        if (newCoefficient !== term.coefficient) {
            var difference = newCoefficient - term.coefficient;
            if (this.isUpperBound === true) {
                difference = -difference;
            }

            term.coefficient = newCoefficient;
            this.model.updateConstraintCoefficient(this, variable, difference);
        }
    }

    return this;
};

var errorVarIdx = 1;
Constraint.prototype.relax = function (weight) {
    if (this.model.isMinimization === false) {
        weight = -weight;
    }

    var error = this.model.addVariable(weight, "e" + (errorVarIdx++).toString());
    this._relax(error);
};

Constraint.prototype._relax = function (error) {
    if (this.isUpperBound) {
        this.setVariableCoefficient(-1, error);
    } else {
        this.setVariableCoefficient(1, error);
    }
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
function Equality(constraintUpper, constraintLower) {
    this.upperBound = constraintUpper;
    this.lowerBound = constraintLower;
    this.model = constraintUpper.model;
    this.rhs = constraintUpper.rhs;
}

Equality.prototype.addTerm = function (coefficient, variable) {
    this.upperBound.addTerm(coefficient, variable);
    this.lowerBound.addTerm(coefficient, variable);
    return this;
};

Equality.prototype.removeTerm = function (term) {
    this.upperBound.removeTerm(term);
    this.lowerBound.removeTerm(term);
    return this;
};

Equality.prototype.setRightHandSide = function (rhs) {
    this.upperBound.setRightHandSide(rhs);
    this.lowerBound.setRightHandSide(rhs);
    this.rhs = rhs;
};

Equality.prototype.relax = function (weight) {
    if (this.model.isMinimization === false) {
        weight = -weight;
    }

    var error = this.model.addVariable(weight, "e" + (errorVarIdx++).toString());
    this.upperBound._relax(error);
    this.lowerBound._relax(error);
};


module.exports = {
    Constraint: Constraint,
    Variable: Variable,
    Equality: Equality,
    Term: Term
};

},{}],8:[function(require,module,exports){
/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/


//-------------------------------------------------------------------
// SimplexJS
// https://github.com/
// An Object-Oriented Linear Programming Solver
//
// By Justin Wolcott (c)
// Licensed under the MIT License.
//-------------------------------------------------------------------

var Tableau = require("./Tableau");
var Model = require("./Model");
var MILP = require("./MILP");
var expressions = require("./expressions.js");
var validation = require("./Validation");
var Constraint = expressions.Constraint;
var Variable = expressions.Variable;
var Numeral = expressions.Numeral;
var Term = expressions.Term;

// Place everything under the Solver Name Space
var Solver = function () {

    "use strict";

    this.Model = Model;
    this.MILP = MILP;
    this.Constraint = Constraint;
    this.Variable = Variable;
    this.Numeral = Numeral;
    this.Term = Term;
    this.Tableau = Tableau;

    /*************************************************************
     * Method: Solve
     * Scope: Public:
     * Agruments:
     *        model: The model we want solver to operate on
     *        precision: If we're solving a MILP, how tight
     *                   do we want to define an integer, given
     *                   that 20.000000000000001 is not an integer.
     *                   (defaults to 1e-9)
     *            full: *get better description*
     *        validate: if left blank, it will get ignored; otherwise
     *                  it will run the model through all validation
     *                  functions in the *Validate* module
     **************************************************************/
    this.Solve = function (model, precision, full, validate) {
        // Run our validations on the model
        // if the model doesn't have a validate
        // attribute set to false
        if(validate){
            for(var test in validation){
                model = validation[test](model);
            }        
        }

        // Make sure we at least have a model
        if (!model) {
            throw new Error("Solver requires a model to operate on");
        }

        if (model instanceof Model === false) {
            model = new Model(precision).loadJson(model);
        }

        var solution = model.solve();
        solution.solutionSet = solution.generateSolutionSet();

        // If the user asks for a full breakdown
        // of the tableau (e.g. full === true)
        // this will return it
        if (full) {
            return solution;
        } else {
            // Otherwise; give the user the bare
            // minimum of info necessary to carry on

            var store = {};

            // 1.) Add in feasibility to store;
            store.feasible = solution.feasible;

            // 2.) Add in the objective value
            store.result = solution.evaluation;

            // 3.) Load all of the variable values
            Object.keys(solution.solutionSet)
                .map(function (d) {
                    store[d] = solution.solutionSet[d];
                });

            return store;
        }

    };

    /*************************************************************
     * Method: ReformatLP
     * Scope: Public:
     * Agruments: model: The model we want solver to operate on
     * Purpose: Convert a friendly JSON model into a model for a
     *          real solving library...in this case
     *          lp_solver
     **************************************************************/
    this.ReformatLP = require("./LP_Solve");
    
    
     /*************************************************************
     * Method: MultiObjective
     * Scope: Public:
     * Agruments:
     *        model: The model we want solver to operate on
     *        detail: if false, or undefined; it will return the
     *                result of using the mid-point formula; otherwise
     *                it will return an object containing:
     *
     *                1. The results from the mid point formula
     *                2. The solution for each objective solved
     *                   in isolation (pareto)
     *                3. The min and max of each variable along
     *                   the frontier of the polytope (ranges)
     * Purpose: Solve a model with multiple objective functions.
     *          Since a potential infinite number of solutions exist
     *          this naively returns the mid-point between 
     *
     * Note: The model has to be changed a little to work with this.
     *       Before an *opType* was required. No more. The objective
     *       attribute of the model is now an object instead of a
     *       string.
     *
     *  *EXAMPLE MODEL*
     *
     *   model = {
     *       optimize: {scotch: "max", soda: "max"},
     *       constraints: {fluid: {equal: 100}},
     *       variables: {
     *           scotch: {fluid: 1, scotch: 1},
     *           soda: {fluid: 1, soda: 1}
     *       }
     *   }
     *       
     **************************************************************/
    this.MultiObjective = function(model, detail){
        return require("./Polyopt")(this, model, detail);
    };
};

// Determine the environment we're in.
// if we're in node, offer a friendly exports
// otherwise, Solver's going global
/* jshint ignore:start */

(function(){
    // If define exists; use it
    if (typeof define === "function") {
        define([], function () {
            return new Solver();
        });
    } else if(typeof window === "object"){
        window.solver = new Solver();
    } else {
        module.exports =  new Solver();
    }
})()

/* jshint ignore:end */

},{"./LP_Solve":1,"./MILP":2,"./Model":3,"./Polyopt":4,"./Tableau":5,"./Validation":6,"./expressions.js":7}]},{},[8]);
