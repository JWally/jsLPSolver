/**
 * @file src/expressions.ts
 * @description Core expression classes for building optimization models
 *
 * Defines the building blocks for programmatic model construction:
 * - Variable: Decision variable with cost and bounds
 * - IntegerVariable: Variable restricted to integer values
 * - SlackVariable: Internal variable for constraint conversion
 * - Term: Variable-coefficient pair in a constraint
 * - Constraint: Linear inequality (<=, >=) with terms
 * - Equality: Equality constraint (=) represented as two inequalities
 *
 * These classes support the fluent API: model.smallerThan(10).addTerm(2, x)
 */
import type Model from "./model";

/**
 * Priority level for hierarchical optimization.
 * Numeric values represent custom priority levels (lower = higher priority).
 * String values map to predefined levels: "required" (0), "strong" (1), "medium" (2), "weak" (3).
 */
export type Priority = number | "required" | "strong" | "medium" | "weak";

/**
 * A continuous decision variable in the optimization problem.
 *
 * Variables represent quantities the solver can adjust. Each variable has
 * an objective coefficient (`cost`), a solution `value`, and a `priority`
 * level for hierarchical optimization.
 */
export class Variable {
    /** Unique string identifier (used in solution output). */
    id: string;
    /** Objective function coefficient. */
    cost: number;
    /** Internal index in the tableau's variable/column arrays. */
    index: number;
    /** Current solution value (set after solving). */
    value: number;
    /** Priority level for hierarchical optimization (0 = primary objective). */
    priority: number;
    /** Whether this variable is restricted to integer values. */
    isInteger?: true;
    /** Whether this is a slack variable (internal, not a decision variable). */
    isSlack?: true;

    /**
     * @param id - Unique identifier for this variable.
     * @param cost - Objective function coefficient.
     * @param index - Internal tableau index.
     * @param priority - Priority level for hierarchical optimization.
     */
    constructor(id: string, cost: number, index: number, priority: number) {
        this.id = id;
        this.cost = cost;
        this.index = index;
        this.value = 0;
        this.priority = priority;
    }
}

/**
 * A decision variable restricted to integer values.
 * The branch-and-cut algorithm ensures integrality in the final solution.
 */
export class IntegerVariable extends Variable {
    isInteger: true = true;

    constructor(id: string, cost: number, index: number, priority: number) {
        super(id, cost, index, priority);
    }
}

/**
 * An internal variable added to convert inequality constraints to equalities.
 * Slack variables have zero cost and priority and are excluded from solution output.
 */
export class SlackVariable extends Variable {
    isSlack: true = true;

    /**
     * @param id - Identifier (typically "s" + index).
     * @param index - Internal tableau index.
     */
    constructor(id: string, index: number) {
        super(id, 0, index, 0);
    }
}

/**
 * A single term in a linear expression: a variable multiplied by a coefficient.
 */
export class Term {
    /** The variable in this term. */
    variable: Variable;
    /** The scalar multiplier for the variable. */
    coefficient: number;

    constructor(variable: Variable, coefficient: number) {
        this.variable = variable;
        this.coefficient = coefficient;
    }
}

type RelaxationModel = Model & {
    addVariable(
        cost: number,
        id: string,
        isInteger?: boolean,
        isUnrestricted?: boolean,
        priority?: number
    ): Variable;
};

/**
 * Create a relaxation variable for a soft constraint.
 *
 * Relaxation variables allow constraints to be violated at a cost in the objective.
 * The `weight` controls how expensive violation is; `priority` controls hierarchical ordering.
 *
 * @param model - The model to add the relaxation variable to.
 * @param weight - Cost per unit of constraint violation (default: 1).
 * @param priority - Priority level; "required" (or 0) means no relaxation is created.
 * @returns The relaxation variable, or null if priority is "required".
 */
export function createRelaxationVariable(
    model: RelaxationModel,
    weight?: number,
    priority?: Priority
): Variable | null {
    if (priority === 0 || priority === "required") {
        return null;
    }

    const normalizedWeight = weight === undefined ? 1 : weight;
    const normalizedPriority = priority === undefined ? 1 : priority;

    const actualWeight = model.isMinimization === false ? -normalizedWeight : normalizedWeight;

    return model.addVariable(
        actualWeight,
        "r" + model.relaxationIndex++,
        false,
        false,
        normalizedPriority as number
    );
}

/**
 * A linear inequality constraint: sum(terms) <= rhs (upper bound) or sum(terms) >= rhs (lower bound).
 *
 * Constraints are created via `model.smallerThan()` or `model.greaterThan()` and populated
 * with terms via the fluent `addTerm()` method. Internally, the constraint is stored
 * in standard form with a slack variable.
 *
 * @example
 * ```ts
 * // x + 2y <= 10
 * const c = model.smallerThan(10);
 * c.addTerm(1, x).addTerm(2, y);
 * ```
 */
export class Constraint {
    /** Slack variable converting this inequality to an equality for the tableau. */
    slack: SlackVariable;
    /** Internal constraint index in the tableau. */
    index: number;
    /** Reference to the parent model (used for dynamic coefficient updates). */
    model: RelaxationModel;
    /** Right-hand side value. */
    rhs: number;
    /** If true, this is a <= constraint; if false, a >= constraint. */
    isUpperBound: boolean;
    /** All terms on the left-hand side. */
    terms: Term[];
    /** Fast lookup of terms by variable index for coefficient updates. */
    termsByVarIndex: Record<number, Term>;
    /** Relaxation variable for soft constraint violation (null if hard). */
    relaxation: Variable | null;

    /**
     * @param rhs - Right-hand side value.
     * @param isUpperBound - True for <= constraint, false for >=.
     * @param index - Internal index assigned by the tableau.
     * @param model - Parent model for registering coefficient updates.
     */
    constructor(rhs: number, isUpperBound: boolean, index: number, model: RelaxationModel) {
        this.slack = new SlackVariable("s" + index, index);
        this.index = index;
        this.model = model;
        this.rhs = rhs;
        this.isUpperBound = isUpperBound;

        this.terms = [];
        this.termsByVarIndex = {};

        this.relaxation = null;
    }

    /**
     * Add a term (coefficient * variable) to this constraint.
     * If the variable already has a term, the coefficients are summed.
     *
     * @param coefficient - Scalar multiplier for the variable.
     * @param variable - The decision variable.
     * @returns This constraint for method chaining.
     */
    addTerm(coefficient: number, variable: Variable): this {
        const varIndex = variable.index;
        const term = this.termsByVarIndex[varIndex];
        if (term === undefined) {
            // No term for given variable
            const newTerm = new Term(variable, coefficient);
            this.termsByVarIndex[varIndex] = newTerm;
            this.terms.push(newTerm);
            const signedCoefficient = this.isUpperBound === true ? -coefficient : coefficient;
            this.model.updateConstraintCoefficient(this, variable, signedCoefficient);
        } else {
            // Term for given variable already exists
            // updating its coefficient
            const newCoefficient = term.coefficient + coefficient;
            this.setVariableCoefficient(newCoefficient, variable);
        }

        return this;
    }

    /** @deprecated Not yet implemented. Placeholder for future term removal. */
    removeTerm(_term: Term): this {
        return this;
    }

    /**
     * Update the right-hand side value of this constraint.
     * Propagates the change to the tableau if already initialized.
     *
     * @param newRhs - New RHS value.
     * @returns This constraint for method chaining.
     */
    setRightHandSide(newRhs: number): this {
        if (newRhs !== this.rhs) {
            let difference = newRhs - this.rhs;
            if (this.isUpperBound === true) {
                difference = -difference;
            }

            this.rhs = newRhs;
            this.model.updateRightHandSide(this, difference);
        }

        return this;
    }

    /**
     * Set the coefficient of a variable in this constraint.
     * Creates a new term if the variable doesn't already appear.
     *
     * @param newCoefficient - The new coefficient value.
     * @param variable - The variable whose coefficient to set.
     * @returns This constraint for chaining, or void if the variable has no index.
     */
    setVariableCoefficient(newCoefficient: number, variable: Variable): this | void {
        const varIndex = variable.index;
        if (varIndex === -1) {
            // eslint-disable-next-line no-console
            console.warn(
                "[Constraint.setVariableCoefficient] Trying to change coefficient of inexistant variable."
            );
            return;
        }

        const term = this.termsByVarIndex[varIndex];
        if (term === undefined) {
            // No term for given variable
            this.addTerm(newCoefficient, variable);
        } else if (newCoefficient !== term.coefficient) {
            // Term for given variable already exists
            // updating its coefficient if changed
            let difference = newCoefficient - term.coefficient;
            if (this.isUpperBound === true) {
                difference = -difference;
            }

            term.coefficient = newCoefficient;
            this.model.updateConstraintCoefficient(this, variable, difference);
        }

        return this;
    }

    /**
     * Make this constraint "soft" by adding a relaxation variable.
     * Violation of the constraint incurs a penalty in the objective.
     *
     * @param weight - Cost per unit of violation (default: 1).
     * @param priority - Priority level for hierarchical optimization.
     */
    relax(weight?: number, priority?: Priority): void {
        this.relaxation = createRelaxationVariable(this.model, weight, priority);
        this._relax(this.relaxation);
    }

    /**
     * Apply a relaxation variable to this constraint.
     * Adds the variable with coefficient +1 (lower bound) or -1 (upper bound).
     */
    _relax(relaxationVariable: Variable | null): void {
        if (relaxationVariable === null) {
            // Relaxation variable not created, priority was probably "required"
            return;
        }

        if (this.isUpperBound) {
            this.setVariableCoefficient(-1, relaxationVariable);
        } else {
            this.setVariableCoefficient(1, relaxationVariable);
        }
    }
}

/**
 * An equality constraint represented as two paired inequalities (upper + lower bound).
 *
 * Created via `model.equal(rhs)`. Operations like `addTerm()` and `relax()` are
 * delegated to both underlying constraints simultaneously.
 */
export class Equality {
    /** The <= constraint (sum <= rhs). */
    upperBound: Constraint;
    /** The >= constraint (sum >= rhs). */
    lowerBound: Constraint;
    /** Reference to the parent model. */
    model: RelaxationModel;
    /** Right-hand side value (same for both bounds). */
    rhs: number;
    /** Shared relaxation variable (null if hard constraint). */
    relaxation: Variable | null;
    /** Type discriminator for distinguishing Equality from Constraint. */
    isEquality: true = true;

    constructor(constraintUpper: Constraint, constraintLower: Constraint) {
        this.upperBound = constraintUpper;
        this.lowerBound = constraintLower;
        this.model = constraintUpper.model;
        this.rhs = constraintUpper.rhs;
        this.relaxation = null;
    }

    /**
     * Add a term to both sides of the equality.
     * @param coefficient - Scalar multiplier.
     * @param variable - The decision variable.
     * @returns This equality for method chaining.
     */
    addTerm(coefficient: number, variable: Variable): this {
        this.upperBound.addTerm(coefficient, variable);
        this.lowerBound.addTerm(coefficient, variable);
        return this;
    }

    /** @deprecated Not yet implemented. Placeholder for future term removal. */
    removeTerm(_term: Term): this {
        this.upperBound.removeTerm(_term);
        this.lowerBound.removeTerm(_term);
        return this;
    }

    /**
     * Update the RHS value for both inequality constraints.
     * @param rhs - New right-hand side value.
     */
    setRightHandSide(rhs: number): void {
        this.upperBound.setRightHandSide(rhs);
        this.lowerBound.setRightHandSide(rhs);
        this.rhs = rhs;
    }

    /**
     * Make this equality constraint soft by adding a shared relaxation variable to both bounds.
     * @param weight - Cost per unit of violation.
     * @param priority - Priority level for hierarchical optimization.
     */
    relax(weight?: number, priority?: Priority): void {
        this.relaxation = createRelaxationVariable(this.model, weight, priority);
        this.upperBound.relaxation = this.relaxation;
        this.upperBound._relax(this.relaxation);
        this.lowerBound.relaxation = this.relaxation;
        this.lowerBound._relax(this.relaxation);
    }
}

/**
 * A wrapped numeric constant, used for expression building APIs.
 */
export class Numeral {
    /** The numeric value. */
    value: number;

    constructor(value: number) {
        this.value = value;
    }
}
