export class Variable {
    constructor(id: string, cost: number, index: number, priority: number);
    id: string;
    cost: number;
    index: number;
    value: number;
    priority: number;
    isInteger?: boolean;
    isSlack?: boolean;
}

export class IntegerVariable extends Variable {
    isInteger: true;
}

export class SlackVariable extends Variable {
    isSlack: true;
}

export class Term {
    constructor(variable: Variable, coefficient: number);
    variable: Variable;
    coefficient: number;
}

export class Constraint {
    constructor(rhs: number, isUpperBound: boolean, index: number, model: any);
    slack: SlackVariable;
    index: number;
    model: any;
    rhs: number;
    isUpperBound: boolean;
    terms: Term[];
    termsByVarIndex: Record<number, Term>;
    relaxation: any;
    addTerm(coefficient: number, variable: Variable): void;
}

export class Equality {
    constructor(upperBound: Constraint, lowerBound: Constraint);
    upperBound: Constraint;
    lowerBound: Constraint;
}

export function createRelaxationVariable(model: any, weight: number, priority?: number): Variable | null;
