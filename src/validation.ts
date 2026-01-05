/**
 * @file src/validation.ts
 * @description Model validation and cleanup utilities
 *
 * Provides pre-solve validation functions that ensure models are properly
 * formatted before solving. All exported functions accept a model and return
 * a valid model (or throw an error if validation fails).
 */
import type { Model as ModelDefinition } from "./types/solver";

/**
 * Common typos and their corrections for model properties.
 */
const PROPERTY_TYPOS: Record<string, string> = {
    optype: "opType",
    OpType: "opType",
    op_type: "opType",
    type: "opType",
    optimise: "optimize",
    Optimize: "optimize",
    objective: "optimize",
    constraint: "constraints",
    Constraints: "constraints",
    variable: "variables",
    Variables: "variables",
    vars: "variables",
    int: "ints",
    integers: "ints",
    Ints: "ints",
    binary: "binaries",
    Binaries: "binaries",
};

/**
 * Common typos for constraint properties.
 */
const CONSTRAINT_TYPOS: Record<string, string> = {
    minimum: "min",
    maximum: "max",
    Min: "min",
    Max: "max",
    eq: "equal",
    equals: "equal",
    Equal: "equal",
};

/**
 * Checks for common typos in model properties and logs warnings.
 *
 * This helps users identify issues like using 'optype' instead of 'opType'
 * which would cause the solver to silently use default behavior.
 */
export function WarnOnTypos(model: ModelDefinition): ModelDefinition {
    const modelKeys = Object.keys(model) as Array<keyof typeof model>;

    // Check top-level property typos
    for (const key of modelKeys) {
        const correction = PROPERTY_TYPOS[key as string];
        if (correction) {
            console.warn(
                `[jsLPSolver] Warning: Model has '${key}' but expected '${correction}'. ` +
                    `This may cause unexpected behavior.`
            );
        }
    }

    // Check for missing required properties
    if (!model.optimize && !modelKeys.some((k) => PROPERTY_TYPOS[k as string] === "optimize")) {
        console.warn(
            `[jsLPSolver] Warning: Model is missing 'optimize' property. ` +
                `The solver needs to know which attribute to optimize.`
        );
    }

    if (!model.opType && !modelKeys.some((k) => PROPERTY_TYPOS[k as string] === "opType")) {
        console.warn(
            `[jsLPSolver] Warning: Model is missing 'opType' property. ` +
                `Defaulting to 'max'. Use 'opType: "max"' or 'opType: "min"' to be explicit.`
        );
    }

    // Check constraint property typos
    if (model.constraints) {
        for (const [constraintName, constraint] of Object.entries(model.constraints)) {
            if (typeof constraint === "object" && constraint !== null) {
                for (const prop of Object.keys(constraint)) {
                    const correction = CONSTRAINT_TYPOS[prop];
                    if (correction) {
                        console.warn(
                            `[jsLPSolver] Warning: Constraint '${constraintName}' has '${prop}' ` +
                                `but expected '${correction}'.`
                        );
                    }
                }
            }
        }
    }

    return model;
}

/**
 * Renames objective attributes that conflict with constraint names.
 *
 * If the optimize attribute is also used as a constraint name, this function
 * creates a new random attribute name to avoid the collision.
 */
export function CleanObjectiveAttributes(model: ModelDefinition): ModelDefinition {
    let fakeAttr: string | number | undefined;
    let x: string;
    let z: string;

    if (typeof model.optimize === "string") {
        if (model.constraints[model.optimize]) {
            // Conflict: objective name matches a constraint name
            fakeAttr = Math.random();

            for (x in model.variables) {
                if (model.variables[x][model.optimize]) {
                    model.variables[x][fakeAttr] = model.variables[x][model.optimize];
                }
            }

            model.constraints[fakeAttr] = model.constraints[model.optimize];
            delete model.constraints[model.optimize];
            return model;
        }
        return model;
    } else {
        // Multi-objective case
        for (z in model.optimize) {
            if (model.constraints[z]) {
                if (model.constraints[z] === "equal") {
                    // Can't optimize an equality-constrained attribute
                    delete model.optimize[z];
                } else {
                    fakeAttr = Math.random();

                    for (x in model.variables) {
                        if (model.variables[x][z]) {
                            model.variables[x][fakeAttr] = model.variables[x][z];
                        }
                    }

                    model.constraints[fakeAttr] = model.constraints[z];
                    delete model.constraints[z];
                }
            }
        }
        return model;
    }
}
