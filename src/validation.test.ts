import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CleanObjectiveAttributes, WarnOnTypos } from "./validation";
import type { Model as ModelDefinition } from "./types/solver";

describe("CleanObjectiveAttributes", () => {
    let mockRandom: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        // Mock Math.random for predictable test results
        mockRandom = vi.spyOn(Math, "random").mockReturnValue(0.123456789);
    });

    afterEach(() => {
        mockRandom.mockRestore();
    });

    describe("single objective (string optimize)", () => {
        it("returns model unchanged when no conflict exists", () => {
            const model: ModelDefinition = {
                optimize: "profit",
                opType: "max",
                constraints: {
                    time: { max: 100 },
                    budget: { max: 500 },
                },
                variables: {
                    x: { profit: 10, time: 2, budget: 5 },
                    y: { profit: 15, time: 3, budget: 8 },
                },
            };

            const result = CleanObjectiveAttributes(model);

            expect(result).toBe(model);
            expect(result.constraints.profit).toBeUndefined();
            expect(result.constraints.time).toBeDefined();
        });

        it("renames constraint when it conflicts with optimize attribute", () => {
            const model: ModelDefinition = {
                optimize: "value",
                opType: "max",
                constraints: {
                    value: { max: 100 }, // Conflicts with optimize
                    other: { min: 10 },
                },
                variables: {
                    x: { value: 5, other: 2 },
                    y: { value: 8, other: 3 },
                },
            };

            const result = CleanObjectiveAttributes(model);

            // Original constraint name should be deleted
            expect(result.constraints.value).toBeUndefined();
            // New constraint with random name should exist
            expect(result.constraints[0.123456789]).toEqual({ max: 100 });
            expect(result.constraints.other).toEqual({ min: 10 });
        });

        it("updates variable coefficients when renaming conflicting constraint", () => {
            const model: ModelDefinition = {
                optimize: "value",
                opType: "max",
                constraints: {
                    value: { max: 100 },
                },
                variables: {
                    x: { value: 5 },
                    y: { value: 8 },
                },
            };

            const result = CleanObjectiveAttributes(model);

            // Variables should have new attribute with the same values
            expect(result.variables.x[0.123456789]).toBe(5);
            expect(result.variables.y[0.123456789]).toBe(8);
        });

        it("handles variables without the conflicting attribute", () => {
            const model: ModelDefinition = {
                optimize: "value",
                opType: "max",
                constraints: {
                    value: { max: 100 },
                },
                variables: {
                    x: { value: 5 },
                    y: { other: 3 }, // No 'value' attribute
                },
            };

            const result = CleanObjectiveAttributes(model);

            expect(result.variables.x[0.123456789]).toBe(5);
            expect(result.variables.y[0.123456789]).toBeUndefined();
        });
    });

    describe("multi-objective (object optimize)", () => {
        it("returns model unchanged when no conflicts exist", () => {
            const model: ModelDefinition = {
                optimize: {
                    profit: "max",
                    efficiency: "max",
                },
                opType: "max",
                constraints: {
                    time: { max: 100 },
                },
                variables: {
                    x: { profit: 10, efficiency: 0.9, time: 2 },
                },
            };

            const result = CleanObjectiveAttributes(model);

            expect(result).toBe(model);
            expect(Object.keys(result.optimize as object)).toContain("profit");
            expect(Object.keys(result.optimize as object)).toContain("efficiency");
        });

        it("removes objective when constraint is 'equal'", () => {
            const model: ModelDefinition = {
                optimize: {
                    profit: "max",
                    fixed: "max", // Will be removed because constraint is 'equal'
                },
                opType: "max",
                constraints: {
                    fixed: "equal" as never, // This is an equality constraint
                    other: { max: 50 },
                },
                variables: {
                    x: { profit: 10, fixed: 5, other: 2 },
                },
            };

            const result = CleanObjectiveAttributes(model);

            // 'fixed' should be removed from optimize
            expect((result.optimize as Record<string, string>).fixed).toBeUndefined();
            expect((result.optimize as Record<string, string>).profit).toBe("max");
        });

        it("renames conflicting constraint when not 'equal'", () => {
            const model: ModelDefinition = {
                optimize: {
                    value: "max",
                },
                opType: "max",
                constraints: {
                    value: { max: 100 }, // Conflicts but not 'equal'
                },
                variables: {
                    x: { value: 5 },
                },
            };

            const result = CleanObjectiveAttributes(model);

            expect(result.constraints.value).toBeUndefined();
            expect(result.constraints[0.123456789]).toEqual({ max: 100 });
        });

        it("updates variable coefficients for multi-objective conflicts", () => {
            const model: ModelDefinition = {
                optimize: {
                    value: "max",
                },
                opType: "max",
                constraints: {
                    value: { max: 100 },
                },
                variables: {
                    x: { value: 5 },
                    y: { value: 8 },
                },
            };

            const result = CleanObjectiveAttributes(model);

            expect(result.variables.x[0.123456789]).toBe(5);
            expect(result.variables.y[0.123456789]).toBe(8);
        });

        it("handles multiple conflicting objectives", () => {
            // Reset mock to return different values for each call
            mockRandom.mockRestore();
            let callCount = 0;
            mockRandom = vi.spyOn(Math, "random").mockImplementation(() => {
                callCount++;
                return callCount * 0.1;
            });

            const model: ModelDefinition = {
                optimize: {
                    a: "max",
                    b: "max",
                },
                opType: "max",
                constraints: {
                    a: { max: 100 },
                    b: { min: 10 },
                },
                variables: {
                    x: { a: 5, b: 3 },
                },
            };

            const result = CleanObjectiveAttributes(model);

            expect(result.constraints.a).toBeUndefined();
            expect(result.constraints.b).toBeUndefined();
            expect(Object.keys(result.constraints).length).toBe(2);
        });

        it("handles variables without conflicting attributes in multi-objective", () => {
            const model: ModelDefinition = {
                optimize: {
                    value: "max",
                },
                opType: "max",
                constraints: {
                    value: { max: 100 },
                },
                variables: {
                    x: { value: 5 },
                    y: { other: 3 }, // No 'value'
                },
            };

            const result = CleanObjectiveAttributes(model);

            expect(result.variables.x[0.123456789]).toBe(5);
            expect(result.variables.y[0.123456789]).toBeUndefined();
        });
    });

    describe("edge cases", () => {
        it("handles empty constraints object", () => {
            const model: ModelDefinition = {
                optimize: "profit",
                opType: "max",
                constraints: {},
                variables: {
                    x: { profit: 10 },
                },
            };

            const result = CleanObjectiveAttributes(model);

            expect(result).toBe(model);
        });

        it("handles empty variables object", () => {
            const model: ModelDefinition = {
                optimize: "value",
                opType: "max",
                constraints: {
                    value: { max: 100 },
                },
                variables: {},
            };

            const result = CleanObjectiveAttributes(model);

            expect(result.constraints.value).toBeUndefined();
            expect(result.constraints[0.123456789]).toEqual({ max: 100 });
        });

        it("handles empty multi-objective optimize", () => {
            const model: ModelDefinition = {
                optimize: {},
                opType: "max",
                constraints: {
                    some: { max: 100 },
                },
                variables: {
                    x: { some: 5 },
                },
            };

            const result = CleanObjectiveAttributes(model);

            expect(result).toBe(model);
        });
    });
});

describe("WarnOnTypos", () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    describe("property typos", () => {
        it("warns when 'optype' is used instead of 'opType'", () => {
            const model = {
                optimize: "profit",
                optype: "max", // typo
                constraints: {},
                variables: {},
            } as unknown as ModelDefinition;

            WarnOnTypos(model);

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining("'optype' but expected 'opType'")
            );
        });

        it("warns when 'optimise' is used instead of 'optimize'", () => {
            const model = {
                optimise: "profit", // British spelling
                opType: "max",
                constraints: {},
                variables: {},
            } as unknown as ModelDefinition;

            WarnOnTypos(model);

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining("'optimise' but expected 'optimize'")
            );
        });

        it("warns when 'constraint' is used instead of 'constraints'", () => {
            const model = {
                optimize: "profit",
                opType: "max",
                constraint: {}, // missing 's'
                variables: {},
            } as unknown as ModelDefinition;

            WarnOnTypos(model);

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining("'constraint' but expected 'constraints'")
            );
        });

        it("warns when 'vars' is used instead of 'variables'", () => {
            const model = {
                optimize: "profit",
                opType: "max",
                constraints: {},
                vars: {}, // shorthand
            } as unknown as ModelDefinition;

            WarnOnTypos(model);

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining("'vars' but expected 'variables'")
            );
        });

        it("warns when 'int' is used instead of 'ints'", () => {
            const model = {
                optimize: "profit",
                opType: "max",
                constraints: {},
                variables: { x: { profit: 1 } },
                int: { x: 1 }, // missing 's'
            } as unknown as ModelDefinition;

            WarnOnTypos(model);

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining("'int' but expected 'ints'")
            );
        });
    });

    describe("missing required properties", () => {
        it("warns when 'optimize' is missing", () => {
            const model = {
                opType: "max",
                constraints: {},
                variables: {},
            } as unknown as ModelDefinition;

            WarnOnTypos(model);

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining("missing 'optimize' property")
            );
        });

        it("warns when 'opType' is missing", () => {
            const model = {
                optimize: "profit",
                constraints: {},
                variables: {},
            } as unknown as ModelDefinition;

            WarnOnTypos(model);

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining("missing 'opType' property")
            );
        });

        it("does not warn about missing opType when optype typo exists", () => {
            const model = {
                optimize: "profit",
                optype: "max", // typo present
                constraints: {},
                variables: {},
            } as unknown as ModelDefinition;

            WarnOnTypos(model);

            // Should warn about the typo, not about missing opType
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining("'optype' but expected 'opType'")
            );
            expect(warnSpy).not.toHaveBeenCalledWith(
                expect.stringContaining("missing 'opType'")
            );
        });
    });

    describe("constraint property typos", () => {
        it("warns when 'minimum' is used instead of 'min'", () => {
            const model: ModelDefinition = {
                optimize: "profit",
                opType: "max",
                constraints: {
                    budget: { minimum: 100 } as never,
                },
                variables: {},
            };

            WarnOnTypos(model);

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining("Constraint 'budget' has 'minimum' but expected 'min'")
            );
        });

        it("warns when 'maximum' is used instead of 'max'", () => {
            const model: ModelDefinition = {
                optimize: "profit",
                opType: "max",
                constraints: {
                    capacity: { maximum: 500 } as never,
                },
                variables: {},
            };

            WarnOnTypos(model);

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining("Constraint 'capacity' has 'maximum' but expected 'max'")
            );
        });

        it("warns when 'equals' is used instead of 'equal'", () => {
            const model: ModelDefinition = {
                optimize: "profit",
                opType: "max",
                constraints: {
                    fixed: { equals: 100 } as never,
                },
                variables: {},
            };

            WarnOnTypos(model);

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining("Constraint 'fixed' has 'equals' but expected 'equal'")
            );
        });
    });

    describe("valid models", () => {
        it("does not warn for correctly structured model", () => {
            const model: ModelDefinition = {
                optimize: "profit",
                opType: "max",
                constraints: {
                    budget: { max: 100 },
                    time: { min: 10 },
                },
                variables: {
                    x: { profit: 10, budget: 5, time: 2 },
                },
                ints: { x: 1 },
            };

            WarnOnTypos(model);

            expect(warnSpy).not.toHaveBeenCalled();
        });

        it("returns the model unchanged", () => {
            const model: ModelDefinition = {
                optimize: "profit",
                opType: "max",
                constraints: {},
                variables: {},
            };

            const result = WarnOnTypos(model);

            expect(result).toBe(model);
        });
    });
});
