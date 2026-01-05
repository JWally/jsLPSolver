/**
 * Random LP/MIP problem generator for testing
 *
 * Generates problems of configurable size and type for:
 * - Performance benchmarking without large static files
 * - Stress testing solver with various problem structures
 * - Fuzz testing with edge cases
 */

export interface GeneratorOptions {
    /** Random seed for reproducibility */
    seed?: number;
    /** Number of decision variables */
    numVariables?: number;
    /** Number of constraints */
    numConstraints?: number;
    /** Fraction of variables that are integers (0-1) */
    integerFraction?: number;
    /** Fraction of variables that are binary (0-1) */
    binaryFraction?: number;
    /** Density of constraint matrix (0-1, fraction of non-zero coefficients) */
    density?: number;
    /** Coefficient range [min, max] */
    coefficientRange?: [number, number];
    /** RHS value range [min, max] */
    rhsRange?: [number, number];
}

export interface GeneratedProblem {
    name: string;
    optimize: string;
    opType: "max" | "min";
    constraints: Record<string, { min?: number; max?: number; equal?: number }>;
    variables: Record<string, Record<string, number>>;
    ints?: Record<string, number>;
    binaries?: Record<string, number>;
}

/**
 * Simple seeded random number generator (Mulberry32)
 */
function createRng(seed: number): () => number {
    return function () {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Generate a random LP problem (continuous variables only)
 */
export function generateRandomLP(options: GeneratorOptions = {}): GeneratedProblem {
    const {
        seed = Date.now(),
        numVariables = 10,
        numConstraints = 5,
        density = 0.7,
        coefficientRange = [1, 100],
        rhsRange = [10, 1000],
    } = options;

    const rng = createRng(seed);
    const random = (min: number, max: number) => min + rng() * (max - min);
    const randomInt = (min: number, max: number) => Math.floor(random(min, max + 1));

    const variables: Record<string, Record<string, number>> = {};
    const constraints: Record<string, { min?: number; max?: number }> = {};

    // Create variables
    for (let v = 0; v < numVariables; v++) {
        const varName = `x${v}`;
        variables[varName] = {
            objective: randomInt(coefficientRange[0], coefficientRange[1]),
        };
    }

    // Create constraints
    for (let c = 0; c < numConstraints; c++) {
        const constraintName = `c${c}`;

        // Add coefficients for each variable (respecting density)
        for (let v = 0; v < numVariables; v++) {
            if (rng() < density) {
                const varName = `x${v}`;
                const coeff = randomInt(coefficientRange[0], coefficientRange[1]);
                variables[varName][constraintName] = coeff;
            }
        }

        // Set RHS (randomly choose <= or >= constraint)
        const rhs = randomInt(rhsRange[0], rhsRange[1]);
        if (rng() < 0.5) {
            constraints[constraintName] = { max: rhs };
        } else {
            constraints[constraintName] = { min: rhs };
        }
    }

    return {
        name: `RandomLP_${numVariables}x${numConstraints}_seed${seed}`,
        optimize: "objective",
        opType: rng() < 0.5 ? "max" : "min",
        constraints,
        variables,
    };
}

/**
 * Generate a random MIP (mixed-integer problem)
 */
export function generateRandomMIP(options: GeneratorOptions = {}): GeneratedProblem {
    const { integerFraction = 0.5, binaryFraction = 0, ...lpOptions } = options;

    const problem = generateRandomLP(lpOptions);
    const varNames = Object.keys(problem.variables);
    const rng = createRng((options.seed ?? Date.now()) + 1);

    const ints: Record<string, number> = {};
    const binaries: Record<string, number> = {};

    for (const varName of varNames) {
        const r = rng();
        if (r < binaryFraction) {
            binaries[varName] = 1;
        } else if (r < binaryFraction + integerFraction) {
            ints[varName] = 1;
        }
    }

    problem.name = problem.name.replace("RandomLP", "RandomMIP");

    if (Object.keys(ints).length > 0) {
        problem.ints = ints;
    }
    if (Object.keys(binaries).length > 0) {
        problem.binaries = binaries;
    }

    return problem;
}

/**
 * Generate a knapsack problem (classic MIP benchmark)
 */
export function generateKnapsack(options: GeneratorOptions = {}): GeneratedProblem {
    const {
        seed = Date.now(),
        numVariables = 20,
        coefficientRange = [1, 50],
        rhsRange = [100, 500],
    } = options;

    const rng = createRng(seed);
    const randomInt = (min: number, max: number) => Math.floor(min + rng() * (max - min + 1));

    const variables: Record<string, Record<string, number>> = {};
    const binaries: Record<string, number> = {};

    // Each item has a value (objective) and weight (capacity constraint)
    for (let i = 0; i < numVariables; i++) {
        const varName = `item${i}`;
        variables[varName] = {
            value: randomInt(coefficientRange[0], coefficientRange[1]),
            weight: randomInt(coefficientRange[0], coefficientRange[1]),
        };
        binaries[varName] = 1;
    }

    const capacity = randomInt(rhsRange[0], rhsRange[1]);

    return {
        name: `Knapsack_${numVariables}_seed${seed}`,
        optimize: "value",
        opType: "max",
        constraints: {
            capacity: { max: capacity },
        },
        variables,
        binaries,
    };
}

/**
 * Generate a set covering problem (MIP)
 */
export function generateSetCover(options: GeneratorOptions = {}): GeneratedProblem {
    const {
        seed = Date.now(),
        numVariables = 15, // number of sets
        numConstraints = 10, // number of elements to cover
        density = 0.3,
        coefficientRange = [1, 20],
    } = options;

    const rng = createRng(seed);
    const randomInt = (min: number, max: number) => Math.floor(min + rng() * (max - min + 1));

    const variables: Record<string, Record<string, number>> = {};
    const binaries: Record<string, number> = {};
    const constraints: Record<string, { min: number }> = {};

    // Create sets (variables)
    for (let s = 0; s < numVariables; s++) {
        const varName = `set${s}`;
        variables[varName] = {
            cost: randomInt(coefficientRange[0], coefficientRange[1]),
        };
        binaries[varName] = 1;

        // Each set covers some elements
        for (let e = 0; e < numConstraints; e++) {
            if (rng() < density) {
                variables[varName][`element${e}`] = 1;
            }
        }
    }

    // Each element must be covered at least once
    for (let e = 0; e < numConstraints; e++) {
        constraints[`element${e}`] = { min: 1 };
    }

    return {
        name: `SetCover_${numVariables}x${numConstraints}_seed${seed}`,
        optimize: "cost",
        opType: "min",
        constraints,
        variables,
        binaries,
    };
}

/**
 * Generate a transportation/assignment problem (LP with special structure)
 */
export function generateTransportation(options: GeneratorOptions = {}): GeneratedProblem {
    const {
        seed = Date.now(),
        numVariables = 4, // sources
        numConstraints = 4, // destinations
        coefficientRange = [1, 100],
        rhsRange = [50, 200],
    } = options;

    const numSources = numVariables;
    const numDestinations = numConstraints;

    const rng = createRng(seed);
    const randomInt = (min: number, max: number) => Math.floor(min + rng() * (max - min + 1));

    const variables: Record<string, Record<string, number>> = {};
    const constraints: Record<string, { min?: number; max?: number; equal?: number }> = {};

    // Supply constraints (each source has limited supply)
    const supplies: number[] = [];
    let totalSupply = 0;
    for (let s = 0; s < numSources; s++) {
        const supply = randomInt(rhsRange[0], rhsRange[1]);
        supplies.push(supply);
        totalSupply += supply;
        constraints[`supply${s}`] = { max: supply };
    }

    // Demand constraints (each destination needs exactly some amount)
    // Scale demands to match total supply
    for (let d = 0; d < numDestinations; d++) {
        const demand = Math.floor(totalSupply / numDestinations);
        constraints[`demand${d}`] = { min: demand };
    }

    // Create shipping variables (source -> destination)
    for (let s = 0; s < numSources; s++) {
        for (let d = 0; d < numDestinations; d++) {
            const varName = `ship_${s}_to_${d}`;
            variables[varName] = {
                cost: randomInt(coefficientRange[0], coefficientRange[1]),
                [`supply${s}`]: 1,
                [`demand${d}`]: 1,
            };
        }
    }

    return {
        name: `Transportation_${numSources}x${numDestinations}_seed${seed}`,
        optimize: "cost",
        opType: "min",
        constraints,
        variables,
    };
}

/**
 * Generate a resource allocation problem (common LP formulation)
 */
export function generateResourceAllocation(options: GeneratorOptions = {}): GeneratedProblem {
    const {
        seed = Date.now(),
        numVariables = 8, // activities
        numConstraints = 4, // resources
        density = 0.6,
        coefficientRange = [1, 50],
        rhsRange = [100, 500],
    } = options;

    const rng = createRng(seed);
    const randomInt = (min: number, max: number) => Math.floor(min + rng() * (max - min + 1));

    const variables: Record<string, Record<string, number>> = {};
    const constraints: Record<string, { max: number }> = {};

    // Create activities
    for (let a = 0; a < numVariables; a++) {
        const varName = `activity${a}`;
        variables[varName] = {
            profit: randomInt(coefficientRange[0], coefficientRange[1]),
        };

        // Each activity uses some resources
        for (let r = 0; r < numConstraints; r++) {
            if (rng() < density) {
                variables[varName][`resource${r}`] = randomInt(1, 20);
            }
        }
    }

    // Resource limits
    for (let r = 0; r < numConstraints; r++) {
        constraints[`resource${r}`] = { max: randomInt(rhsRange[0], rhsRange[1]) };
    }

    return {
        name: `ResourceAllocation_${numVariables}x${numConstraints}_seed${seed}`,
        optimize: "profit",
        opType: "max",
        constraints,
        variables,
    };
}

/**
 * Generate a batch of problems of various types and sizes
 */
export function generateProblemBatch(count: number, baseSeed = Date.now()): GeneratedProblem[] {
    const problems: GeneratedProblem[] = [];
    const generators = [
        generateRandomLP,
        generateRandomMIP,
        generateKnapsack,
        generateSetCover,
        generateTransportation,
        generateResourceAllocation,
    ];

    for (let i = 0; i < count; i++) {
        const seed = baseSeed + i * 1000;
        const generator = generators[i % generators.length];
        const size = 5 + (i % 10) * 5; // Vary size from 5 to 50

        problems.push(
            generator({
                seed,
                numVariables: size,
                numConstraints: Math.ceil(size * 0.6),
            })
        );
    }

    return problems;
}
