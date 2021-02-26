import Tableau from "./Tableau.js";

//-------------------------------------------------------------------
//-------------------------------------------------------------------
class Cut {
    constructor(type, varIndex, value) {
        this.type = type;
        this.varIndex = varIndex;
        this.value = value;
    }
}

//-------------------------------------------------------------------
//-------------------------------------------------------------------
class Branch {
    constructor(relaxedEvaluation, cuts) {
        this.relaxedEvaluation = relaxedEvaluation;
        this.cuts = cuts;
    }
}



//-------------------------------------------------------------------
// Applying cuts on a tableau and resolving
//-------------------------------------------------------------------
Tableau.prototype.applyCuts = function (branchingCuts) {
    // Restoring initial solution
    this.restore();

    this.addCutConstraints(branchingCuts);
    this.simplex();
    // Adding MIR cuts
    if (this.model.useMIRCuts) {
        let fractionalVolumeImproved = true;
        while (fractionalVolumeImproved) {
            const fractionalVolumeBefore = this.computeFractionalVolume(true);
            this.applyMIRCuts();
            this.simplex();

            const fractionalVolumeAfter = this.computeFractionalVolume(true);

            // If the new fractional volume is bigger than 90% of the previous one
            // we assume there is no improvement from the MIR cuts
            if (fractionalVolumeAfter >= 0.9 * fractionalVolumeBefore) {
                fractionalVolumeImproved = false;
            }
        }
    }
};

//-------------------------------------------------------------------
// Function: MILP
// Detail: Main function, my attempt at a mixed integer linear programming
//         solver
//-------------------------------------------------------------------
Tableau.prototype.branchAndCut = function () {
    //-------------------------------------------------------------------
    // Branch sorting strategies
    //-------------------------------------------------------------------
    function sortByEvaluation(a, b) {
        return b.relaxedEvaluation - a.relaxedEvaluation;
    }

    const branches = [];
    let iterations = 0;
    const tolerance = this.model.tolerance;
    let toleranceFlag = true;
    let terminalTime = 1e99;

    //
    // Set Start Time on model...
    // Let's build out a way to *gracefully* quit
    // after {{time}} milliseconds
    //

    // 1.) Check to see if there's a timeout on the model
    //
    if (this.model.timeout) {
        // 2.) Hooray! There is!
        //     Calculate the final date
        //
        terminalTime = Date.now() + this.model.timeout;
    }

    // This is the default result
    // If nothing is both *integral* and *feasible*
    let bestEvaluation = Infinity;
    let bestBranch = null;
    const bestOptionalObjectivesEvaluations = [];
    for (let oInit = 0; oInit < this.optionalObjectives.length; oInit += 1) {
        bestOptionalObjectivesEvaluations.push(Infinity);
    }

    // And here...we...go!

    // 1.) Load a model into the queue
    let branch = new Branch(-Infinity, []);
    let acceptableThreshold;

    branches.push(branch);
    // If all branches have been exhausted terminate the loop
    while (branches.length > 0 && toleranceFlag === true && Date.now() < terminalTime) {

        if (this.model.isMinimization) {
            acceptableThreshold = this.bestPossibleEval * (1 + tolerance);
        } else {
            acceptableThreshold = this.bestPossibleEval * (1 - tolerance);
        }

        // Abort while loop if termination tolerance is both specified and condition is met
        if (tolerance > 0) {
            if (bestEvaluation < acceptableThreshold) {
                toleranceFlag = false;
            }
        }

        // Get a model from the queue
        branch = branches.pop();
        if (branch.relaxedEvaluation > bestEvaluation) {
            continue;
        }

        // Solving from initial relaxed solution
        // with additional cut constraints

        // Adding cut constraints
        const cuts = branch.cuts;
        this.applyCuts(cuts);

        iterations++;
        if (this.feasible === false) {
            continue;
        }

        const evaluation = this.evaluation;
        if (evaluation > bestEvaluation) {
            // This branch does not contain the optimal solution
            continue;
        }

        // To deal with the optional objectives
        if (evaluation === bestEvaluation) {
            let isCurrentEvaluationWorse = true;
            for (var o = 0; o < this.optionalObjectives.length; o += 1) {
                if (this.optionalObjectives[o].reducedCosts[0] > bestOptionalObjectivesEvaluations[o]) {
                    break;
                } else if (this.optionalObjectives[o].reducedCosts[0] < bestOptionalObjectivesEvaluations[o]) {
                    isCurrentEvaluationWorse = false;
                    break;
                }
            }

            if (isCurrentEvaluationWorse) {
                continue;
            }
        }

        // Is the model both integral and feasible?
        if (this.isIntegral() === true) {

            //
            // Store the fact that we are integral
            //
            this.__isIntegral = true;


            if (iterations === 1) {
                this.branchAndCutIterations = iterations;
                return;
            }
            // Store the solution as the bestSolution
            bestBranch = branch;
            bestEvaluation = evaluation;
            for (let oCopy = 0; oCopy < this.optionalObjectives.length; oCopy += 1) {
                bestOptionalObjectivesEvaluations[oCopy] = this.optionalObjectives[oCopy].reducedCosts[0];
            }


            // -------------------------------------
            // In Case we want to keep early solutions
            if (this.model.keep_solutions) {

                const nowSolution = (this.model.tableau.getSolution());
                const store = nowSolution.generateSolutionSet();
                store.result = nowSolution.evaluation;

                if (!this.model.solutions) {
                    this.model.solutions = [];
                }


                this.model.solutions.push(store);

            }


        } else {
            if (iterations === 1) {
                // Saving the first iteration
                // TODO: implement a better strategy for saving the tableau?
                this.save();
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
            const variable = this.getMostFractionalVar();

            const varIndex = variable.index;

            const cutsHigh = [];
            const cutsLow = [];

            // var nCuts = cuts.length;
            for (let c = 0; c < cuts.length; c += 1) {
                const cut = cuts[c];
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

            const minVariableValue = Math.ceil(variable.value);
            const maxVariableValue = Math.floor(variable.value);

            const cutHigh = new Cut("min", varIndex, minVariableValue);
            cutsHigh.push(cutHigh);

            const cutLow = new Cut("max", varIndex, maxVariableValue);
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
        this.applyCuts(bestBranch.cuts);
    }
    this.branchAndCutIterations = iterations;
};
