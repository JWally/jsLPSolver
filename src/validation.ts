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
