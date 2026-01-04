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
 * Probing: Temporarily fix binary variables and propagate to find implications.
 * If fixing x=0 causes infeasibility, then x must be 1 (and vice versa).
 * If both x=0 and x=1 imply y has same bound, that bound is valid.
 */
function probe(
    model: Model,
    result: PresolveResult,
    maxProbes: number = 100
): boolean {
    let changed = false;
    let probeCount = 0;

    // Only probe binary/integer variables
    for (const variable of model.integerVariables) {
        if (result.fixedVariables.has(variable)) continue;
        if (probeCount >= maxProbes) break;
        probeCount++;

        // Get current bounds
        const bounds = result.tightenedBounds.get(variable) ?? {};
        const lower = bounds.lower ?? 0;
        const upper = bounds.upper ?? 1;

        // Skip if already fixed or not binary-like
        if (upper - lower < 0.5) continue;
        if (lower < -0.5 || upper > 1.5) continue; // Not binary

        // Try fixing to 0
        const impliedAt0 = propagateFixing(model, result, variable, 0);
        // Try fixing to 1
        const impliedAt1 = propagateFixing(model, result, variable, 1);

        if (impliedAt0.infeasible && impliedAt1.infeasible) {
            // Problem is infeasible
            result.isInfeasible = true;
            return false;
        }

        if (impliedAt0.infeasible) {
            // x must be 1
            result.fixedVariables.set(variable, 1);
            result.stats.variablesFixed++;
            changed = true;
            continue;
        }

        if (impliedAt1.infeasible) {
            // x must be 0
            result.fixedVariables.set(variable, 0);
            result.stats.variablesFixed++;
            changed = true;
            continue;
        }

        // Check for common implications
        for (const [v, val0] of impliedAt0.fixed) {
            const val1 = impliedAt1.fixed.get(v);
            if (val1 !== undefined && Math.abs(val0 - val1) < 1e-6) {
                // Both branches fix v to same value
                if (!result.fixedVariables.has(v)) {
                    result.fixedVariables.set(v, val0);
                    result.stats.variablesFixed++;
                    changed = true;
                }
            }
        }
    }

    return changed;
}

/**
 * Propagate implications of fixing a variable to a value.
 * Returns implied fixings and whether it causes infeasibility.
 */
function propagateFixing(
    model: Model,
    result: PresolveResult,
    fixedVar: Variable,
    fixedValue: number
): { fixed: Map<Variable, number>; infeasible: boolean } {
    const implied: Map<Variable, number> = new Map();
    implied.set(fixedVar, fixedValue);

    // Simple propagation through constraints
    for (const constraint of model.constraints) {
        if (result.removedConstraints.has(constraint)) continue;

        // Calculate contribution of fixed variables
        let fixedSum = 0;
        let unfixedTerms: Array<{ variable: Variable; coefficient: number }> = [];

        for (const term of constraint.terms) {
            const fixed = result.fixedVariables.get(term.variable) ?? implied.get(term.variable);
            if (fixed !== undefined) {
                fixedSum += term.coefficient * fixed;
            } else {
                unfixedTerms.push({ variable: term.variable, coefficient: term.coefficient });
            }
        }

        // If all variables fixed, check feasibility
        if (unfixedTerms.length === 0) {
            if (constraint.isUpperBound) {
                if (fixedSum > constraint.rhs + 1e-6) {
                    return { fixed: implied, infeasible: true };
                }
            } else {
                if (fixedSum < constraint.rhs - 1e-6) {
                    return { fixed: implied, infeasible: true };
                }
            }
        }

        // If one variable left, may be able to fix it
        if (unfixedTerms.length === 1) {
            const term = unfixedTerms[0];
            const remaining = constraint.rhs - fixedSum;
            const bound = remaining / term.coefficient;

            // For binary variables, check if bound forces a value
            if (term.variable.isInteger) {
                const varBounds = result.tightenedBounds.get(term.variable) ?? {};
                const varLower = varBounds.lower ?? 0;
                const varUpper = varBounds.upper ?? 1;

                if (constraint.isUpperBound && term.coefficient > 0) {
                    // x <= bound
                    if (bound < varLower - 1e-6) {
                        return { fixed: implied, infeasible: true };
                    }
                    if (bound < 0.5 && varLower >= -0.5 && varUpper <= 1.5) {
                        implied.set(term.variable, 0);
                    }
                } else if (!constraint.isUpperBound && term.coefficient > 0) {
                    // x >= bound
                    if (bound > varUpper + 1e-6) {
                        return { fixed: implied, infeasible: true };
                    }
                    if (bound > 0.5 && varLower >= -0.5 && varUpper <= 1.5) {
                        implied.set(term.variable, 1);
                    }
                }
            }
        }
    }

    return { fixed: implied, infeasible: false };
}

/**
 * Coefficient tightening for knapsack-like constraints.
 * If a coefficient is larger than the remaining capacity, reduce it.
 */
function tightenCoefficients(model: Model, result: PresolveResult): boolean {
    let changed = false;

    for (const constraint of model.constraints) {
        if (result.removedConstraints.has(constraint)) continue;
        if (!constraint.isUpperBound) continue; // Only for <= constraints

        // Calculate min activity (all variables at their lower bounds)
        let minActivity = 0;
        for (const term of constraint.terms) {
            if (result.fixedVariables.has(term.variable)) {
                minActivity += term.coefficient * result.fixedVariables.get(term.variable)!;
            } else {
                const bounds = result.tightenedBounds.get(term.variable) ?? {};
                const lower = bounds.lower ?? 0;
                if (term.coefficient > 0) {
                    minActivity += term.coefficient * lower;
                } else {
                    const upper = bounds.upper ?? Infinity;
                    minActivity += term.coefficient * upper;
                }
            }
        }

        // For each variable, check if coefficient can be tightened
        const slack = constraint.rhs - minActivity;
        if (slack < 0) continue; // Constraint may be infeasible

        for (const term of constraint.terms) {
            if (result.fixedVariables.has(term.variable)) continue;
            if (!term.variable.isInteger) continue;
            if (term.coefficient <= 0) continue;

            const bounds = result.tightenedBounds.get(term.variable) ?? {};
            const lower = bounds.lower ?? 0;
            const upper = bounds.upper ?? 1;

            // For binary variables: if coeff > slack, can reduce to slack
            if (lower >= -0.5 && upper <= 1.5) {
                const effectiveCoeff = term.coefficient * (upper - lower);
                if (effectiveCoeff > slack + 1e-6) {
                    // Could tighten coefficient - but we don't modify the model
                    // Instead, derive an upper bound on the variable
                    const impliedUpper = lower + slack / term.coefficient;
                    if (impliedUpper < upper - 1e-6) {
                        const current = result.tightenedBounds.get(term.variable) ?? {};
                        if (!current.upper || impliedUpper < current.upper) {
                            result.tightenedBounds.set(term.variable, {
                                ...current,
                                upper: impliedUpper,
                            });
                            result.stats.boundsTightened++;
                            changed = true;
                        }
                    }
                }
            }
        }
    }

    return changed;
}

/**
 * Detect redundant constraints using activity bounds.
 * If max activity <= RHS for <= constraint, it's redundant.
 */
function removeRedundantConstraints(model: Model, result: PresolveResult): boolean {
    let changed = false;

    for (const constraint of model.constraints) {
        if (result.removedConstraints.has(constraint)) continue;

        // Calculate activity bounds
        let minActivity = 0;
        let maxActivity = 0;

        for (const term of constraint.terms) {
            const fixed = result.fixedVariables.get(term.variable);
            if (fixed !== undefined) {
                minActivity += term.coefficient * fixed;
                maxActivity += term.coefficient * fixed;
                continue;
            }

            const bounds = result.tightenedBounds.get(term.variable) ?? {};
            const lower = bounds.lower ?? 0;
            const upper = bounds.upper ?? Infinity;

            if (term.coefficient > 0) {
                minActivity += term.coefficient * lower;
                maxActivity += term.coefficient * (upper === Infinity ? 1e10 : upper);
            } else {
                minActivity += term.coefficient * (upper === Infinity ? 1e10 : upper);
                maxActivity += term.coefficient * lower;
            }
        }

        // Check redundancy
        if (constraint.isUpperBound) {
            // <= constraint is redundant if max activity <= RHS
            if (maxActivity <= constraint.rhs + 1e-6) {
                result.removedConstraints.add(constraint);
                result.stats.constraintsRemoved++;
                changed = true;
            }
            // Infeasible if min activity > RHS
            if (minActivity > constraint.rhs + 1e-6) {
                result.isInfeasible = true;
                return false;
            }
        } else {
            // >= constraint is redundant if min activity >= RHS
            if (minActivity >= constraint.rhs - 1e-6) {
                result.removedConstraints.add(constraint);
                result.stats.constraintsRemoved++;
                changed = true;
            }
            // Infeasible if max activity < RHS
            if (maxActivity < constraint.rhs - 1e-6) {
                result.isInfeasible = true;
                return false;
            }
        }
    }

    return changed;
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
 * 5. Probing (for binary variables)
 * 6. Coefficient tightening
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

        // Pass 3: Remove redundant constraints using activity bounds
        if (removeRedundantConstraints(model, result)) {
            changed = true;
        }
        if (result.isInfeasible) return result;

        // Pass 4: Coefficient tightening for knapsack-like constraints
        if (tightenCoefficients(model, result)) {
            changed = true;
        }

        // Pass 5: Probing for binary variables (disabled - needs more work on equality constraints)
        // TODO: Fix probing to handle equality constraints correctly
        // if (passes <= 2 && model.integerVariables.length > 0) {
        //     const probeLimit = Math.min(50, model.integerVariables.length);
        //     if (probe(model, result, probeLimit)) {
        //         changed = true;
        //     }
        //     if (result.isInfeasible) return result;
        // }
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
