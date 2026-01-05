import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    Variable,
    IntegerVariable,
    SlackVariable,
    Term,
    Constraint,
    Equality,
    Numeral,
    createRelaxationVariable,
} from "./expressions";

/**
 * Creates a mock Model for testing constraint operations.
 */
function createMockModel(options?: { isMinimization?: boolean }) {
    return {
        isMinimization: options?.isMinimization ?? true,
        relaxationIndex: 0,
        updateConstraintCoefficient: vi.fn(),
        updateRightHandSide: vi.fn(),
        addVariable: vi.fn((cost, id, _isInteger, _isUnrestricted, priority) => {
            return new Variable(id, cost, 100, priority);
        }),
    };
}

describe("Variable", () => {
    describe("constructor", () => {
        it("creates a variable with all properties", () => {
            const variable = new Variable("x", 5, 0, 1);

            expect(variable.id).toBe("x");
            expect(variable.cost).toBe(5);
            expect(variable.index).toBe(0);
            expect(variable.priority).toBe(1);
            expect(variable.value).toBe(0);
        });

        it("initializes value to 0", () => {
            const variable = new Variable("y", 10, 1, 2);
            expect(variable.value).toBe(0);
        });

        it("allows negative cost", () => {
            const variable = new Variable("z", -3, 2, 0);
            expect(variable.cost).toBe(-3);
        });

        it("allows zero priority", () => {
            const variable = new Variable("w", 1, 3, 0);
            expect(variable.priority).toBe(0);
        });
    });
});

describe("IntegerVariable", () => {
    describe("constructor", () => {
        it("creates an integer variable extending Variable", () => {
            const intVar = new IntegerVariable("x", 5, 0, 1);

            expect(intVar.id).toBe("x");
            expect(intVar.cost).toBe(5);
            expect(intVar.index).toBe(0);
            expect(intVar.priority).toBe(1);
            expect(intVar.isInteger).toBe(true);
        });

        it("sets isInteger flag to true", () => {
            const intVar = new IntegerVariable("y", 0, 1, 0);
            expect(intVar.isInteger).toBe(true);
        });
    });
});

describe("SlackVariable", () => {
    describe("constructor", () => {
        it("creates a slack variable with zero cost and priority", () => {
            const slack = new SlackVariable("s1", 5);

            expect(slack.id).toBe("s1");
            expect(slack.cost).toBe(0);
            expect(slack.index).toBe(5);
            expect(slack.priority).toBe(0);
            expect(slack.isSlack).toBe(true);
        });

        it("sets isSlack flag to true", () => {
            const slack = new SlackVariable("s2", 10);
            expect(slack.isSlack).toBe(true);
        });
    });
});

describe("Term", () => {
    describe("constructor", () => {
        it("creates a term with variable and coefficient", () => {
            const variable = new Variable("x", 5, 0, 1);
            const term = new Term(variable, 3);

            expect(term.variable).toBe(variable);
            expect(term.coefficient).toBe(3);
        });

        it("allows negative coefficients", () => {
            const variable = new Variable("y", 1, 1, 0);
            const term = new Term(variable, -2.5);

            expect(term.coefficient).toBe(-2.5);
        });

        it("allows zero coefficient", () => {
            const variable = new Variable("z", 1, 2, 0);
            const term = new Term(variable, 0);

            expect(term.coefficient).toBe(0);
        });
    });
});

describe("createRelaxationVariable", () => {
    it("returns null when priority is 0", () => {
        const model = createMockModel();
        const result = createRelaxationVariable(model as never, 1, 0);
        expect(result).toBeNull();
    });

    it("returns null when priority is 'required'", () => {
        const model = createMockModel();
        const result = createRelaxationVariable(model as never, 1, "required");
        expect(result).toBeNull();
    });

    it("creates relaxation variable with default weight and priority", () => {
        const model = createMockModel();
        const result = createRelaxationVariable(model as never);

        expect(result).not.toBeNull();
        expect(model.addVariable).toHaveBeenCalledWith(1, "r0", false, false, 1);
    });

    it("uses provided weight", () => {
        const model = createMockModel();
        createRelaxationVariable(model as never, 5);

        expect(model.addVariable).toHaveBeenCalledWith(5, "r0", false, false, 1);
    });

    it("negates weight for maximization problems", () => {
        const model = createMockModel({ isMinimization: false });
        createRelaxationVariable(model as never, 3);

        expect(model.addVariable).toHaveBeenCalledWith(-3, "r0", false, false, 1);
    });

    it("increments relaxation index", () => {
        const model = createMockModel();

        createRelaxationVariable(model as never);
        expect(model.relaxationIndex).toBe(1);

        createRelaxationVariable(model as never);
        expect(model.relaxationIndex).toBe(2);
    });

    it("handles string priorities other than required", () => {
        const model = createMockModel();
        createRelaxationVariable(model as never, 1, "strong");

        expect(model.addVariable).toHaveBeenCalledWith(1, "r0", false, false, "strong");
    });
});

describe("Constraint", () => {
    let model: ReturnType<typeof createMockModel>;

    beforeEach(() => {
        model = createMockModel();
    });

    describe("constructor", () => {
        it("creates an upper bound constraint", () => {
            const constraint = new Constraint(10, true, 0, model as never);

            expect(constraint.rhs).toBe(10);
            expect(constraint.isUpperBound).toBe(true);
            expect(constraint.index).toBe(0);
            expect(constraint.terms).toEqual([]);
            expect(constraint.slack.id).toBe("s0");
        });

        it("creates a lower bound constraint", () => {
            const constraint = new Constraint(5, false, 1, model as never);

            expect(constraint.rhs).toBe(5);
            expect(constraint.isUpperBound).toBe(false);
            expect(constraint.index).toBe(1);
            expect(constraint.slack.id).toBe("s1");
        });

        it("initializes relaxation to null", () => {
            const constraint = new Constraint(10, true, 0, model as never);
            expect(constraint.relaxation).toBeNull();
        });
    });

    describe("addTerm", () => {
        it("adds a new term to the constraint", () => {
            const constraint = new Constraint(10, true, 0, model as never);
            const variable = new Variable("x", 1, 1, 0);

            constraint.addTerm(3, variable);

            expect(constraint.terms).toHaveLength(1);
            expect(constraint.terms[0].variable).toBe(variable);
            expect(constraint.terms[0].coefficient).toBe(3);
        });

        it("returns this for chaining", () => {
            const constraint = new Constraint(10, true, 0, model as never);
            const variable = new Variable("x", 1, 1, 0);

            const result = constraint.addTerm(3, variable);

            expect(result).toBe(constraint);
        });

        it("negates coefficient for upper bound constraints", () => {
            const constraint = new Constraint(10, true, 0, model as never);
            const variable = new Variable("x", 1, 1, 0);

            constraint.addTerm(3, variable);

            expect(model.updateConstraintCoefficient).toHaveBeenCalledWith(
                constraint,
                variable,
                -3
            );
        });

        it("keeps coefficient positive for lower bound constraints", () => {
            const constraint = new Constraint(10, false, 0, model as never);
            const variable = new Variable("x", 1, 1, 0);

            constraint.addTerm(3, variable);

            expect(model.updateConstraintCoefficient).toHaveBeenCalledWith(constraint, variable, 3);
        });

        it("updates existing term coefficient when variable already has a term", () => {
            const constraint = new Constraint(10, true, 0, model as never);
            const variable = new Variable("x", 1, 1, 0);

            constraint.addTerm(3, variable);
            constraint.addTerm(2, variable);

            expect(constraint.terms).toHaveLength(1);
            expect(constraint.terms[0].coefficient).toBe(5);
        });

        it("allows chaining multiple terms", () => {
            const constraint = new Constraint(10, true, 0, model as never);
            const x = new Variable("x", 1, 1, 0);
            const y = new Variable("y", 2, 2, 0);

            constraint.addTerm(3, x).addTerm(4, y);

            expect(constraint.terms).toHaveLength(2);
        });
    });

    describe("removeTerm", () => {
        it("returns this (no-op currently)", () => {
            const constraint = new Constraint(10, true, 0, model as never);
            const term = new Term(new Variable("x", 1, 1, 0), 3);

            const result = constraint.removeTerm(term);

            expect(result).toBe(constraint);
        });
    });

    describe("setRightHandSide", () => {
        it("updates RHS and calls model.updateRightHandSide", () => {
            const constraint = new Constraint(10, false, 0, model as never);

            constraint.setRightHandSide(15);

            expect(constraint.rhs).toBe(15);
            expect(model.updateRightHandSide).toHaveBeenCalledWith(constraint, 5);
        });

        it("negates difference for upper bound constraints", () => {
            const constraint = new Constraint(10, true, 0, model as never);

            constraint.setRightHandSide(15);

            expect(constraint.rhs).toBe(15);
            expect(model.updateRightHandSide).toHaveBeenCalledWith(constraint, -5);
        });

        it("returns this for chaining", () => {
            const constraint = new Constraint(10, true, 0, model as never);
            const result = constraint.setRightHandSide(15);
            expect(result).toBe(constraint);
        });

        it("does nothing when RHS is unchanged", () => {
            const constraint = new Constraint(10, true, 0, model as never);

            constraint.setRightHandSide(10);

            expect(model.updateRightHandSide).not.toHaveBeenCalled();
        });
    });

    describe("setVariableCoefficient", () => {
        it("adds new term if variable not present", () => {
            const constraint = new Constraint(10, true, 0, model as never);
            const variable = new Variable("x", 1, 1, 0);

            constraint.setVariableCoefficient(5, variable);

            expect(constraint.terms).toHaveLength(1);
            expect(constraint.terms[0].coefficient).toBe(5);
        });

        it("updates existing term coefficient", () => {
            const constraint = new Constraint(10, true, 0, model as never);
            const variable = new Variable("x", 1, 1, 0);

            constraint.addTerm(3, variable);
            model.updateConstraintCoefficient.mockClear();

            constraint.setVariableCoefficient(7, variable);

            expect(constraint.terms[0].coefficient).toBe(7);
            // Difference is 7 - 3 = 4, negated for upper bound = -4
            expect(model.updateConstraintCoefficient).toHaveBeenCalledWith(
                constraint,
                variable,
                -4
            );
        });

        it("returns undefined and warns for variable with index -1", () => {
            const constraint = new Constraint(10, true, 0, model as never);
            const variable = new Variable("x", 1, -1, 0);
            const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

            const result = constraint.setVariableCoefficient(5, variable);

            expect(result).toBeUndefined();
            expect(warnSpy).toHaveBeenCalled();
            warnSpy.mockRestore();
        });

        it("does nothing when coefficient unchanged", () => {
            const constraint = new Constraint(10, true, 0, model as never);
            const variable = new Variable("x", 1, 1, 0);

            constraint.addTerm(5, variable);
            model.updateConstraintCoefficient.mockClear();

            constraint.setVariableCoefficient(5, variable);

            expect(model.updateConstraintCoefficient).not.toHaveBeenCalled();
        });

        it("returns this for chaining when successful", () => {
            const constraint = new Constraint(10, true, 0, model as never);
            const variable = new Variable("x", 1, 1, 0);

            const result = constraint.setVariableCoefficient(5, variable);

            expect(result).toBe(constraint);
        });
    });

    describe("relax", () => {
        it("creates relaxation variable and applies to constraint", () => {
            const constraint = new Constraint(10, true, 0, model as never);

            constraint.relax(2, 1);

            expect(constraint.relaxation).not.toBeNull();
            expect(model.addVariable).toHaveBeenCalled();
        });

        it("sets coefficient to -1 for upper bound constraints", () => {
            const constraint = new Constraint(10, true, 0, model as never);

            constraint.relax();

            // The relaxation variable should have coefficient -1 for upper bound
            expect(constraint.termsByVarIndex[100]).toBeDefined();
            expect(constraint.termsByVarIndex[100].coefficient).toBe(-1);
        });

        it("sets coefficient to 1 for lower bound constraints", () => {
            const constraint = new Constraint(10, false, 0, model as never);

            constraint.relax();

            expect(constraint.termsByVarIndex[100]).toBeDefined();
            expect(constraint.termsByVarIndex[100].coefficient).toBe(1);
        });

        it("does nothing when priority is required", () => {
            const constraint = new Constraint(10, true, 0, model as never);

            constraint.relax(1, "required");

            expect(constraint.relaxation).toBeNull();
        });
    });

    describe("_relax", () => {
        it("does nothing when relaxation variable is null", () => {
            const constraint = new Constraint(10, true, 0, model as never);

            constraint._relax(null);

            expect(constraint.terms).toHaveLength(0);
        });
    });
});

describe("Equality", () => {
    let model: ReturnType<typeof createMockModel>;
    let upper: Constraint;
    let lower: Constraint;

    beforeEach(() => {
        model = createMockModel();
        upper = new Constraint(10, true, 0, model as never);
        lower = new Constraint(10, false, 1, model as never);
    });

    describe("constructor", () => {
        it("creates equality from upper and lower bound constraints", () => {
            const equality = new Equality(upper, lower);

            expect(equality.upperBound).toBe(upper);
            expect(equality.lowerBound).toBe(lower);
            expect(equality.model).toBe(model);
            expect(equality.rhs).toBe(10);
            expect(equality.isEquality).toBe(true);
        });

        it("initializes relaxation to null", () => {
            const equality = new Equality(upper, lower);
            expect(equality.relaxation).toBeNull();
        });
    });

    describe("addTerm", () => {
        it("adds term to both upper and lower bounds", () => {
            const equality = new Equality(upper, lower);
            const variable = new Variable("x", 1, 1, 0);

            equality.addTerm(3, variable);

            expect(upper.terms).toHaveLength(1);
            expect(lower.terms).toHaveLength(1);
        });

        it("returns this for chaining", () => {
            const equality = new Equality(upper, lower);
            const variable = new Variable("x", 1, 1, 0);

            const result = equality.addTerm(3, variable);

            expect(result).toBe(equality);
        });

        it("allows chaining multiple terms", () => {
            const equality = new Equality(upper, lower);
            const x = new Variable("x", 1, 1, 0);
            const y = new Variable("y", 2, 2, 0);

            equality.addTerm(3, x).addTerm(4, y);

            expect(upper.terms).toHaveLength(2);
            expect(lower.terms).toHaveLength(2);
        });
    });

    describe("removeTerm", () => {
        it("calls removeTerm on both bounds and returns this", () => {
            const equality = new Equality(upper, lower);
            const term = new Term(new Variable("x", 1, 1, 0), 3);

            const result = equality.removeTerm(term);

            expect(result).toBe(equality);
        });
    });

    describe("setRightHandSide", () => {
        it("updates RHS on both bounds", () => {
            const equality = new Equality(upper, lower);

            equality.setRightHandSide(20);

            expect(equality.rhs).toBe(20);
            expect(upper.rhs).toBe(20);
            expect(lower.rhs).toBe(20);
        });
    });

    describe("relax", () => {
        it("creates single relaxation variable for both bounds", () => {
            const equality = new Equality(upper, lower);

            equality.relax(2, 1);

            expect(equality.relaxation).not.toBeNull();
            expect(upper.relaxation).toBe(equality.relaxation);
            expect(lower.relaxation).toBe(equality.relaxation);
        });

        it("applies relaxation to both constraints", () => {
            const equality = new Equality(upper, lower);

            equality.relax();

            // Upper bound gets -1, lower bound gets 1
            expect(upper.termsByVarIndex[100].coefficient).toBe(-1);
            expect(lower.termsByVarIndex[100].coefficient).toBe(1);
        });

        it("does nothing when priority is required", () => {
            const equality = new Equality(upper, lower);

            equality.relax(1, "required");

            expect(equality.relaxation).toBeNull();
        });
    });
});

describe("Numeral", () => {
    describe("constructor", () => {
        it("creates a numeral with value", () => {
            const num = new Numeral(42);
            expect(num.value).toBe(42);
        });

        it("allows negative values", () => {
            const num = new Numeral(-5.5);
            expect(num.value).toBe(-5.5);
        });

        it("allows zero", () => {
            const num = new Numeral(0);
            expect(num.value).toBe(0);
        });
    });
});
