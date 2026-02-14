/**
 * @file src/types/solver.ts
 * @description Public API type definitions
 *
 * Defines the types exposed to library consumers:
 * - Model: JSON model definition format
 * - SolveResult: Solution output format
 * - SolveOptions: Solver configuration options
 * - ConstraintBound: Constraint specification
 * - Variable, Term, Constraint: Expression types
 */
/** Direction for single-objective optimization. */
export type ObjectiveDirection = "max" | "min";

/** Constraint relation type when specified as a string shorthand. */
export type ConstraintRelation = "min" | "max" | "equal";

/**
 * Configuration options passed to the solver to control algorithm behavior.
 *
 * These can be specified at the top level of the model or nested under `options`.
 * The `options` object takes precedence over top-level properties.
 */
export interface SolveOptions {
    /** Optimality tolerance for branch-and-cut. Stops early when incumbent is within this fraction of the bound. */
    tolerance?: number;
    /** Maximum solve time in milliseconds. The solver returns the best solution found so far when exceeded. */
    timeout?: number;
    /** Enable Mixed Integer Rounding cuts to tighten LP relaxations during branch-and-cut. */
    useMIRCuts?: boolean;
    /** If true, abort when a pivot cycle is detected (prevents infinite loops on degenerate problems). */
    exitOnCycles?: boolean;
    /** If true, store all integer-feasible solutions found during branch-and-cut (not just the best). */
    keep_solutions?: boolean;
    /** Node selection strategy for branch-and-bound tree exploration. */
    nodeSelection?: "best-first" | "depth-first" | "hybrid";
    /** Variable selection (branching) strategy for choosing which fractional variable to branch on. */
    branching?: "most-fractional" | "pseudocost" | "strong";
    /** Enable preprocessing reductions (variable fixing, bound tightening, redundant constraint removal). */
    presolve?: boolean;
    /** Use incremental state management for branch-and-bound (experimental; stores checkpoints to avoid full restores). */
    useIncremental?: boolean;
}

/**
 * Specifies bounds for a constraint in the JSON model format.
 *
 * A constraint can have a lower bound (`min`), upper bound (`max`), or equality (`equal`).
 * Soft constraints can specify `weight` and `priority` for relaxation.
 */
export interface ConstraintBound {
    /** Lower bound: the constraint sum must be >= this value. */
    min?: number;
    /** Upper bound: the constraint sum must be <= this value. */
    max?: number;
    /** Equality: the constraint sum must equal this value exactly. */
    equal?: number;
    /** Relaxation weight for soft constraints. Higher weight = harder to violate. */
    weight?: number;
    /** Relaxation priority level. "required" constraints cannot be violated. */
    priority?: number | "required" | "strong" | "medium" | "weak";
}

/**
 * Maps constraint names to the variable's coefficient in each constraint.
 * Also includes the objective attribute coefficient.
 */
export interface VariableCoefficients {
    [constraintName: string]: number;
}

/**
 * JSON model definition format for specifying optimization problems.
 *
 * This is the primary input format for `solver.Solve()`. It defines the objective,
 * constraints, and variables in a declarative JSON structure.
 *
 * @example
 * ```ts
 * const model: Model = {
 *     optimize: "profit",
 *     opType: "max",
 *     constraints: {
 *         wood: { max: 300 },
 *         labor: { max: 110 }
 *     },
 *     variables: {
 *         table: { wood: 30, labor: 5, profit: 1200 },
 *         chair: { wood: 20, labor: 10, profit: 1000 }
 *     },
 *     ints: { table: true, chair: true }
 * };
 * ```
 */
export interface Model {
    /** Optional model name for identification/debugging. */
    name?: string;
    /** Attribute name to optimize, or a map of attribute names to directions for multi-objective. */
    optimize: string | Record<string, ObjectiveDirection>;
    /** Optimization direction (ignored when `optimize` is a multi-objective map). */
    opType?: ObjectiveDirection;
    /** Map of constraint names to their bound specifications. */
    constraints: Record<string, ConstraintBound | ConstraintRelation>;
    /** Map of variable names to their constraint coefficients. */
    variables: Record<string, VariableCoefficients>;
    /** Variables restricted to integer values. */
    ints?: Record<string, boolean | 0 | 1>;
    /** Variables restricted to 0 or 1 (automatically implies an upper bound of 1). */
    binaries?: Record<string, boolean | 0 | 1>;
    /** Variables that may take negative values (by default, all variables are non-negative). */
    unrestricted?: Record<string, boolean | 0 | 1>;
    /** Shorthand for `options.tolerance`. */
    tolerance?: number;
    /** Shorthand for `options.timeout`. */
    timeout?: number;
    /** Solver configuration options. */
    options?: SolveOptions;
    /** Configuration for delegating to an external solver process (e.g., lp_solve). */
    external?: {
        /** Name of the external solver to use (e.g., "lpsolve"). */
        solver: string;
        [key: string]: unknown;
    };
}

/**
 * A decision variable in the optimization problem.
 * Represents a quantity the solver can adjust to optimize the objective.
 */
export interface Variable {
    /** Unique identifier for this variable. */
    id: string;
    /** Objective function coefficient (contribution to the objective per unit). */
    cost: number;
    /** Internal index in the tableau's variable arrays. */
    index: number;
    /** Current value assigned by the solver. */
    value: number;
    /** Priority level for hierarchical optimization (0 = primary objective). */
    priority: number;
    /** Whether this variable must take an integer value. */
    isInteger?: boolean;
    /** Whether this is a slack variable introduced for constraint conversion. */
    isSlack?: boolean;
}

/**
 * A variable-coefficient pair representing one term in a linear expression.
 */
export interface Term {
    /** The variable this term references. */
    variable: Variable;
    /** The coefficient multiplying the variable. */
    coefficient: number;
}

/**
 * A linear constraint in the optimization problem.
 * Represents a linear inequality or equality over decision variables.
 */
export interface Constraint {
    /** Slack variable added to convert inequality to equality for the tableau. */
    slack: Variable;
    /** Internal index for the constraint in the tableau. */
    index: number;
    /** Reference to the parent Model. */
    model: unknown;
    /** Right-hand side value of the constraint. */
    rhs: number;
    /** If true, constraint is <= (upper bound); if false, >= (lower bound). */
    isUpperBound: boolean;
    /** All terms on the left-hand side of the constraint. */
    terms: Term[];
    /** Fast lookup of terms by variable index. */
    termsByVarIndex: Record<number, Term>;
    /** Relaxation variable for soft constraints (null if hard constraint). */
    relaxation: Variable | null;
}

/**
 * A wrapped numeric value, used internally for expression building.
 */
export interface Numeral {
    /** The numeric value. */
    value: number;
}

/**
 * Simplified solution object returned by `solver.Solve()`.
 *
 * Contains feasibility status, optimal objective value, and the values
 * of all non-zero decision variables as dynamic properties.
 */
export interface SolveResult {
    /** Whether a feasible solution was found. */
    feasible: boolean;
    /** Optimal objective function value (0 if infeasible). */
    result: number;
    /** Whether the problem is bounded. False indicates unbounded objective. */
    bounded?: boolean;
    /** Whether the solution satisfies all integrality constraints. */
    isIntegral?: boolean;
    /** Decision variable values (only non-zero variables are included). */
    [variable: string]: number | boolean | undefined;
}

export type { ExternalSolvers, ExternalSolverModule } from "../external/main";

/**
 * Type-safe solution access with known variable names.
 * Extends SolveResult to provide typed access to specific variable values.
 *
 * @typeParam TVariable - Union of variable name string literals.
 */
export type Solution<TVariable extends string = string> = SolveResult &
    Record<TVariable, number | undefined>;

/** The full Solver class API type (useful for dependency injection). */
export type SolverAPI = typeof import("../main").default;

/** Alias for backwards compatibility with older API consumers. */
export type ModelDefinition = Model;
