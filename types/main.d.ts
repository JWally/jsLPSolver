/**
 * Specifies how to constrain a variable in the model.
 */
export interface IModelVariableConstraint {
    /** The variable should be grater or equal to this value. */
    min?: number;
    /** The variable should be less or equal to this value. */
    max?: number;
    /** The variable should be equal to this value. */
    equal?: number;
}

/**
 * Specifies the options when solving the problem.
 */
export interface IModelOptions {
    /**
     * For MILP problems, specifies the relative tolerance of the objective,
     * where `0` means 0% and `1` means 100%.
     */
    tolerance?: number;
    /**
     * How many milliseconds you want to allow for the solver to try
     * and solve the model you're running.
     */
    timeout?: number;
    /**
     * Use MIR cuts.
     * @deprecated NOT WORKING
     */
    useMIRCuts?: boolean;
    /**
     * Defaults to `true`.
     */
    exitOnCycles?: boolean;
}

/**
 * Represents an LP/MILP problem.
 * @typeparam TSolutionVar the decision variables that will be outputed to the `Solution` object.
 * @typeparam TInternalVar the decision variables that will not be outputed to the `Solution` object.
 */
export interface IModel<TSolutionVar extends string = string, TInternalVar extends string = string> {
    /** Name of the variable that will be the optimization objective. */
    optimize: (TSolutionVar | TInternalVar);
    /** To which direction to optimize the objective. */
    opType: "max" | "min";
    /**
     * Optimization constraints.
     * Specify an object with variable name as keys.
    */
    constraints: { [variable in (TSolutionVar | TInternalVar)]?: IModelVariableConstraint };
    /**
     * Variable identity relations.
     * Specify an object with variable name as keys. These variables will be outputted into solution.
     * The values of the object represents a linear combination of all the (rest of) variables.
     * @example
     *      ```
     *      {
     *          x: { x1: 10, x2: 5, x3: 2, x: 1 }       // x = 10 x1 + 5 x2 + 2 x3
     *      }
     *      ```
     */
    variables: { [variable in TSolutionVar]?: { [variable in (TSolutionVar | TInternalVar)]?: number } };
    /**
     * For each variable in the MILP problem, specifies whether it is an integer variable.
     * You need to specify `true` or `1` for integer variable.
     * If not specified, all the variables are continual non-negative (range `[0,+∞)`).
     */
    ints?: { [variable in (TSolutionVar | TInternalVar)]?: boolean | 0 | 1 };
    /**
     * For each variable in the MILP problem, specifies whether it is a binary variable.
     * You need to specify `true` or `1` for binary variable.
     * If not specified, all the variables are continual non-negative (range `[0,+∞)`).
     */
    binaries?: { [variable in (TSolutionVar | TInternalVar)]?: boolean | 0 | 1 };
    /**
     * For each variable in the MILP problem, specifies whether it is an unrestricted variable (range `(-∞,+∞)`).
     * You need to specify `true` or `1` for unrestricted variable.
     * If not specified, all the variables are continual non-negative (range `[0,+∞)`).
     */
    unrestricted?: { [variable in (TSolutionVar | TInternalVar)]?: boolean | 0 | 1 };
    /**
     * Options for solving this problem.
     */
    options?: IModelOptions;
}

/**
 * Represents the solution status of an LP/MILP problem.
 */
export interface ISolutionStatus {
    /** Whether the problem is feasible. */
    feasible: boolean;
    /** Value pf the objective function. */
    result: number;
    /** Whether the decision variables are bounded. */
    bounded?: boolean;
    /** For MILP problem, whether an integral solution has been reached. */
    isIntegral?: boolean;
}

/**
 * Represents a LP/MILP solution with its status.
 * @remarks If a variable has value `0`, it will be neglected from the output.
 */
export type Solution<TSolutionVar extends string> = ISolutionStatus & { [variable in TSolutionVar]?: number };

/**
 * Gets the last solved model.
 */
export const lastSolvedModel: IModel;


/**
 * Converts the LP file content into a model object that jsLPSolver can handle.
 * @param model Array of string containing raw content of model we want solver to operate on,
 *      each item is a line of content, without suffixing `"\n"`.
 *      See http://lpsolve.sourceforge.net/5.5/lp-format.htm for the spec.
 */
export function ReformatLP(model: string[]): IModel;
/**
 * Convert a friendly JSON model into a model for a real solving library...
 *      in this case lp_solver.
 * @param model The model we want solver to operate on.
 */
export function ReformatLP(model: IModel<any, any>): string;

/**
 * Solves an LP/MILP problem.
 * @param model The model we want solver to operate on.
 * @param precision If we're solving a MILP, how tight
 *      do we want to define an integer, given
 *      that `20.000000000000001` is not an integer.
 *      (defaults to `1e-9`)
 * @param full *get better description*
 * @param validate if left blank, it will get ignored; otherwise
 *      it will run the model through all validation
 *      functions in the *Validate* module
 */
export function Solve<TSolutionVar extends string, TInternalVar extends string>(
    model: IModel<TSolutionVar, TInternalVar>, precision?: number,
    full?: boolean, validate?: unknown): Solution<TSolutionVar>;


//==================== WIP BELOW ====================//
// Members below this line are automatically generated and need to be sorted out.
// I will gradually move the members up across this line.

/** Declaration file generated by dts-gen */

export class Constraint {
    constructor(rhs: any, isUpperBound: any, index: any, model: any);

    addTerm(coefficient: any, variable: any): any;

    relax(weight: any, priority: any): void;

    removeTerm(term: any): any;

    setRightHandSide(newRhs: any): any;

    setVariableCoefficient(newCoefficient: any, variable: any): any;
}

export class Model {
    constructor(precision: any, name: any);

    activateMIRCuts(useMIRCuts: any): void;

    addVariable(cost: any, id: any, isInteger: any, isUnrestricted: any, priority: any): any;

    debug(debugCheckForCycles: any): void;

    equal(rhs: any): any;

    getNumberOfIntegerVariables(): any;

    greaterThan(rhs: any): any;

    isFeasible(): any;

    loadJson(jsonModel: any): any;

    log(message: any): any;

    maximize(): any;

    minimize(): any;

    removeConstraint(constraint: any): any;

    removeVariable(variable: any): any;

    restore(): any;

    save(): any;

    setCost(cost: any, variable: any): any;

    smallerThan(rhs: any): any;

    solve(): any;

    updateConstraintCoefficient(constraint: any, variable: any, difference: any): any;

    updateRightHandSide(constraint: any, difference: any): any;
}

export class Tableau {
    constructor(precision: any);

    addConstraint(constraint: any): void;

    addCutConstraints(cutConstraints: any): void;

    addVariable(variable: any): void;

    applyCuts(branchingCuts: any): void;

    applyMIRCuts(): void;

    branchAndCut(): void;

    checkForCycles(varIndexes: any): any;

    computeFractionalVolume(ignoreIntegerValues: any): any;

    copy(): any;

    countIntegerValues(): any;

    density(): any;

    getFractionalVarWithLowestCost(): any;

    getMostFractionalVar(): any;

    getNewElementIndex(): any;

    getSolution(): any;

    initialize(width: any, height: any, variables: any, unrestrictedVars: any): void;

    isIntegral(): any;

    log(message: any, force: any): any;

    phase1(): any;

    phase2(): any;

    pivot(pivotRowIndex: any, pivotColumnIndex: any): void;

    removeConstraint(constraint: any): void;

    removeVariable(variable: any): void;

    restore(): void;

    save(): void;

    setEvaluation(): void;

    setModel(model: any): any;

    setOptionalObjective(priority: any, column: any, cost: any): any;

    simplex(): any;

    solve(): any;

    updateConstraintCoefficient(constraint: any, variable: any, difference: any): void;

    updateCost(variable: any, difference: any): void;

    updateRightHandSide(constraint: any, difference: any): void;

    updateVariableValues(): void;

}

export const External: {
};

export const Numeral: any;

export const branchAndCut: {
};


export function MultiObjective(model: any): any;

export function Term(variable: any, coefficient: any): void;

export function Variable(id: any, cost: any, index: any, priority: any): void;
