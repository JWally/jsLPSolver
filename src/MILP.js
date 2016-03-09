/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/
var Solution = require("./Solution.js");

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
//-------------------------------------------------------------------
function MilpSolution(relaxedSolution, iterations) {
    Solution.call(this, relaxedSolution._tableau, relaxedSolution.evaluation, relaxedSolution.feasible, relaxedSolution.bounded);
    this.iter = iterations;
}

MilpSolution.prototype = Object.create(Solution.prototype);
MilpSolution.prototype.constructor = MilpSolution;

//-------------------------------------------------------------------
// Branch sorting strategies
//-------------------------------------------------------------------
function sortByEvaluation(a, b) {
    return b.relaxedEvaluation - a.relaxedEvaluation;
}


//-------------------------------------------------------------------
// Applying cuts on a tableau and resolving
//-------------------------------------------------------------------
function applyCuts(tableau, cuts){
    // Restoring initial solution
    tableau.restore();

    tableau.addCutConstraints(cuts);
    tableau.solve();

    // Adding MIR cuts
    var fractionalVolumeImproved = true;
    while(fractionalVolumeImproved){
        var fractionalVolumeBefore = tableau.computeFractionalVolume(true);

        tableau.applyMIRCuts();
        tableau.solve();

        var fractionalVolumeAfter = tableau.computeFractionalVolume(true);

        // If the new fractional volume is bigger than 90% of the previous one
        // we assume there is no improvement from the MIR cuts
        if(fractionalVolumeAfter >= 0.9 * fractionalVolumeBefore){
            fractionalVolumeImproved = false;
        }
    }
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
    var bestBranch = null;

    // And here...we...go!

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

        // Adding cut constraints
        var cuts = branch.cuts;

        applyCuts(tableau, cuts);

        // console.log(iterations, tableau.matrix[0][tableau.rhsColumn], tableau.feasible, branches.length);

        iterations++;
        if (tableau.feasible === false) {
            continue;
        }

        var evaluation = tableau.evaluation;
        if (evaluation >= bestEvaluation) {
            // This branch does not contain the optimal solution
            continue;
        }

        // Is the model both integral and feasible?
        if (tableau.isIntegral() === true) {
            if (iterations === 1) {
                tableau.updateVariableValues();
                return new MilpSolution(tableau.getSolution(), iterations);
            }

            // Store the solution as the bestSolution
            bestBranch = branch;
            bestEvaluation = evaluation;
        } else {
            if (iterations === 1) {
                // Saving the first iteration
                // TODO: implement a better strategy for saving the tableau?
                tableau.save();
            }

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

    // Adding cut constraints for the optimal solution
    if (bestBranch !== null) {
        // The model is feasible
        applyCuts(tableau, bestBranch.cuts);
        tableau.updateVariableValues();
    }

    // Solving a last time
    return new MilpSolution(tableau.getSolution(), iterations);
}

module.exports = MILP;
