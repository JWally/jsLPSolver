/**
 * @file src/tableau/presolve.ts
 * @description Problem preprocessing for LP/MIP
 *
 * Applies reductions before solving to simplify the problem:
 * - Fix variables with equal bounds
 * - Detect singleton rows (single-variable constraints)
 * - Tighten variable bounds from constraint coefficients
 * - Remove redundant constraints
 *
 * Based on techniques from COIN-OR CBC, CPLEX, and Gurobi.
 */
import type Model from "../model";
import type { Variable, Constraint } from "../expressions";

export interface PresolveResult {
    fixedVariables: Map<Variable, number>;
    removedConstraints: Set<Constraint>;
    tightenedBounds: Map<Variable, { lower?: number; upper?: number }>;
    isInfeasible: boolean;
    stats: {
        variablesFixed: number;
        constraintsRemoved: number;
        boundsTightened: number;
    };
}

/**
 * Presolve reductions for Mixed Integer Programs.
 * Based on techniques from COIN-OR CBC, CPLEX, and Gurobi.
 *
 * Key techniques:
 * 1. Fixed variable removal
 * 2. Singleton row detection
 * 3. Bound tightening
 * 4. Redundant constraint removal
 */
export function presolve(model: Model): PresolveResult {
    const result: PresolveResult = {
        fixedVariables: new Map(),
        removedConstraints: new Set(),
        tightenedBounds: new Map(),
        isInfeasible: false,
        stats: {
            variablesFixed: 0,
            constraintsRemoved: 0,
            boundsTightened: 0,
        },
    };

    // Multiple passes for propagation
    let changed = true;
    let passes = 0;
    const maxPasses = 5;

    while (changed && passes < maxPasses) {
        changed = false;
        passes++;

        // Pass 1: Singleton rows - constraints with single variable
        for (const constraint of model.constraints) {
            if (result.removedConstraints.has(constraint)) continue;

            const activeTerms = constraint.terms.filter(
                (t) => !result.fixedVariables.has(t.variable)
            );

            if (activeTerms.length === 0) {
                // All variables fixed - check feasibility
                let lhs = 0;
                for (const term of constraint.terms) {
                    const fixedVal = result.fixedVariables.get(term.variable);
                    if (fixedVal !== undefined) {
                        lhs += term.coefficient * fixedVal;
                    }
                }

                const satisfied = constraint.isUpperBound
                    ? lhs <= constraint.rhs + 1e-6
                    : lhs >= constraint.rhs - 1e-6;

                if (!satisfied) {
                    result.isInfeasible = true;
                    return result;
                }

                result.removedConstraints.add(constraint);
                result.stats.constraintsRemoved++;
                changed = true;
            } else if (activeTerms.length === 1) {
                // Singleton row - can fix or tighten bounds
                const term = activeTerms[0];
                const variable = term.variable;
                const coeff = term.coefficient;

                // Calculate RHS adjustment for fixed variables
                let rhsAdj = constraint.rhs;
                for (const t of constraint.terms) {
                    if (t.variable !== variable) {
                        const fixedVal = result.fixedVariables.get(t.variable);
                        if (fixedVal !== undefined) {
                            rhsAdj -= t.coefficient * fixedVal;
                        }
                    }
                }

                const bound = rhsAdj / coeff;

                if (constraint.isUpperBound) {
                    // x <= bound (if coeff > 0) or x >= bound (if coeff < 0)
                    if (coeff > 0) {
                        // Upper bound
                        const current = result.tightenedBounds.get(variable);
                        if (!current?.upper || bound < current.upper) {
                            result.tightenedBounds.set(variable, {
                                ...current,
                                upper: bound,
                            });
                            result.stats.boundsTightened++;
                            changed = true;
                        }
                    } else {
                        // Lower bound (coefficient is negative)
                        const current = result.tightenedBounds.get(variable);
                        if (!current?.lower || bound > current.lower) {
                            result.tightenedBounds.set(variable, {
                                ...current,
                                lower: bound,
                            });
                            result.stats.boundsTightened++;
                            changed = true;
                        }
                    }
                }

                result.removedConstraints.add(constraint);
                result.stats.constraintsRemoved++;
            }
        }

        // Pass 2: Check for fixed variables from bounds
        for (const [variable, bounds] of result.tightenedBounds) {
            if (result.fixedVariables.has(variable)) continue;

            if (bounds.lower !== undefined && bounds.upper !== undefined) {
                if (bounds.lower > bounds.upper + 1e-6) {
                    result.isInfeasible = true;
                    return result;
                }

                if (Math.abs(bounds.lower - bounds.upper) < 1e-6) {
                    // Variable is fixed
                    let fixedValue = bounds.lower;

                    // If integer, round to nearest integer
                    if (variable.isInteger) {
                        fixedValue = Math.round(fixedValue);
                    }

                    result.fixedVariables.set(variable, fixedValue);
                    result.stats.variablesFixed++;
                    changed = true;
                }
            }

            // Binary variables with lower bound >= 0.5 are fixed to 1
            if (variable.isInteger && bounds.lower !== undefined && bounds.lower >= 0.5) {
                const upperBound = bounds.upper ?? Infinity;
                if (upperBound <= 1.5) {
                    result.fixedVariables.set(variable, 1);
                    result.stats.variablesFixed++;
                    changed = true;
                }
            }

            // Binary variables with upper bound <= 0.5 are fixed to 0
            if (variable.isInteger && bounds.upper !== undefined && bounds.upper <= 0.5) {
                const lowerBound = bounds.lower ?? 0;
                if (lowerBound >= -0.5) {
                    result.fixedVariables.set(variable, 0);
                    result.stats.variablesFixed++;
                    changed = true;
                }
            }
        }
    }

    return result;
}

/**
 * Detect problem structure for specialized handling.
 */
export interface ProblemStructure {
    type: "general" | "set-covering" | "set-partitioning" | "assignment" | "knapsack";
    hasAllBinaryVars: boolean;
    hasEqualityConstraints: boolean;
    avgConstraintDensity: number;
}

export function detectProblemStructure(model: Model): ProblemStructure {
    const nVars = model.variables.length;
    const nConstraints = model.constraints.length;
    const nIntegerVars = model.integerVariables.length;

    // Check if all variables are binary (0-1)
    const hasAllBinaryVars = nIntegerVars === nVars;

    // Count equality constraints and check structure
    let equalityCount = 0;
    let coveringLike = 0;
    let totalTerms = 0;

    for (const constraint of model.constraints) {
        totalTerms += constraint.terms.length;

        // Check if this looks like a covering/partitioning constraint
        // (all coefficients are 1, RHS is 1, >= or =)
        const allOnes = constraint.terms.every((t) => Math.abs(t.coefficient - 1) < 1e-6);
        const rhsIsOne = Math.abs(constraint.rhs - 1) < 1e-6;

        if (allOnes && rhsIsOne) {
            if (!constraint.isUpperBound) {
                coveringLike++;
            }
            equalityCount++;
        }
    }

    const avgConstraintDensity = nConstraints > 0 ? totalTerms / nConstraints : 0;
    const hasEqualityConstraints = equalityCount > 0;

    // Determine problem type
    let type: ProblemStructure["type"] = "general";

    if (hasAllBinaryVars && coveringLike > nConstraints * 0.5) {
        // Most constraints are covering-like
        if (equalityCount > nConstraints * 0.8) {
            type = "set-partitioning";
        } else {
            type = "set-covering";
        }
    }

    // Assignment problem: n equality constraints, each with same # of variables
    if (hasAllBinaryVars && equalityCount === nConstraints && avgConstraintDensity > 2) {
        type = "assignment";
    }

    return {
        type,
        hasAllBinaryVars,
        hasEqualityConstraints,
        avgConstraintDensity,
    };
}
