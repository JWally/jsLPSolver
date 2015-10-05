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
function MILP(tableau) {
    var branches = [];

    var iterations = 0;

    // This is the default result
    // If nothing is both *integral* and *feasible*
    var bestSolution = {
        evaluation: Infinity,
        solutionSet: {},
        feasible: false
    };

    var bestEvaluation = Infinity;

    // And here...we...go!

    // Running solver a first time to obtain an initial solution
    tableau.solve();

    // Saving initial solution
    tableau.save();

    // 1.) Load a model into the queue
    var nbIntegerVariables = tableau.getNumberOfIntegerVariables();
    var branch = new Branch(-Infinity, [], nbIntegerVariables);
    branches.push(branch);

    // If all branches have been exhausted terminate the loop
    while (branches.length > 0) {
        // Get a model from the queue
        branch = branches.pop();

        if (branch.relaxedEvaluation >= bestEvaluation) {
            continue;
        }

        // Restoring initial solution
        tableau.restore();

        // Adding cut constraints
        var cuts = branch.cuts;
        tableau.addCutConstraints(cuts);

        // Solving using initial relaxed solution
        // and addition cut constraints
        tableau.solve();

        // Keep Track of how many cycles
        // we've gone through
        iterations++;

        if (tableau.feasible === false) {
            continue;
        }

        // Is the model both integral and feasible?
        if (tableau.isIntegral() === true) {
            // Is the new result the bestSolution that we've ever had?
            if (tableau.evaluation < bestEvaluation) {
                // Store the solution as the bestSolution
                bestSolution = tableau.compileSolution();
                bestEvaluation = tableau.evaluation;

                // Removing useless branches
                for (var b = 0; b < branches.length; b += 1) {
                    if (branches[b].relaxedEvaluation < bestEvaluation) {
                        if (b !== 0) {
                            branches.splice(0, b);
                        }
                        break;
                    }
                }
            }

            // The solution is feasible and interagal;
            // But it is worse than the current solution;
            // Ignore it.
        } else if (tableau.evaluation < bestEvaluation) {
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
            // var variable = tableau.getMostFractionalVar();
            var variable = tableau.getFractionalVarWithLowestCost();
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

            var cutHigh = new Cut("min", varIndex, Math.ceil(
                variable.value));
            cutsHigh.push(cutHigh);

            var cutLow = new Cut("max", varIndex, Math.floor(
                variable.value));
            cutsLow.push(cutLow);

            var relaxedEvaluation = tableau.evaluation;
            branches.push(new Branch(relaxedEvaluation, cutsHigh));
            branches.push(new Branch(relaxedEvaluation, cutsLow));

            // Sorting branches
            // Branches with the most promising lower bounds
            // will be picked first
            branches.sort(sortByEvaluation);
            // branches.sort(sortByNbIntegers);
            // branches.sort(sortAdvanced);
        }
    }

    bestSolution.iter = iterations;
    return bestSolution;
}
module.exports = MILP;
