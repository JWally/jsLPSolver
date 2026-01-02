import type { Model as ModelDefinition, ObjectiveDirection, SolveResult } from "./types/solver";

// The solver only calls the `Solve` method here, so we only type the portion we need.
interface SolverLike {
    Solve(
        model: ModelDefinition,
        precision?: number,
        full?: boolean,
        validate?: boolean
    ): PolyoptSolution;
}

// Multi-objective solutions are still shaped like regular solve results but may
// include additional numeric attributes for the auxiliary objectives.
type PolyoptSolution = SolveResult & Record<string, number>;

type ObjectiveMap = Record<string, ObjectiveDirection>;

type Vertex = Record<string, number>;

export interface PolyoptResult {
    midpoint: PolyoptSolution;
    vertices: Vertex[];
    ranges: Record<string, { min: number; max: number }>;
}

/**
 * Create a structured, JSON-friendly clone of the incoming model so we can
 * mutate it freely during the multi-objective solve without affecting callers.
 */
function cloneModel(model: ModelDefinition): ModelDefinition {
    return JSON.parse(JSON.stringify(model));
}

/**
 * Populate the solution object with synthetic values for any objective
 * attribute that is not a standalone variable by aggregating contributions
 * from the model's variables.
 */
function backfillObjectiveAttributes(
    solution: PolyoptSolution,
    workingModel: ModelDefinition,
    objectiveKeys: string[]
): void {
    for (const attribute of objectiveKeys) {
        // Skip attributes that already exist as explicit variables.
        if (workingModel.variables[attribute]) {
            continue;
        }

        if (typeof solution[attribute] !== "number") {
            solution[attribute] = 0;
        }

        for (const [variableName, coefficients] of Object.entries(workingModel.variables)) {
            const variableContribution = coefficients[attribute];
            const solvedValue = solution[variableName];

            if (typeof variableContribution === "number" && typeof solvedValue === "number") {
                solution[attribute] += solvedValue * variableContribution;
            }
        }
    }
}

/**
 * Build a string key for a solution vector so we can detect identical vertices
 * (within a small rounding tolerance) and avoid double-counting them when
 * computing the midpoint.
 */
function buildVectorKey(solution: PolyoptSolution, objectiveKeys: string[]): string {
    const suffix = objectiveKeys
        .map((key) => {
            const value = solution[key];
            // Round to three decimals so tiny floating point differences do not
            // create distinct vector identifiers.
            return typeof value === "number" ? Math.round(value * 1000) / 1000 : 0;
        })
        .join("-");

    return `base-${suffix}`;
}

/**
 * Ensure each vertex object contains all attribute keys and capture the min/max
 * range for each objective across the Pareto set.
 */
function computeRanges(vertices: Vertex[]): Record<string, { min: number; max: number }> {
    const ranges: Record<string, { min: number; max: number }> = {};

    // First pass: establish keys and initial ranges from observed values.
    for (const vertex of vertices) {
        for (const [key, value] of Object.entries(vertex)) {
            if (typeof value !== "number") {
                continue;
            }

            const current = ranges[key] ?? { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY };
            ranges[key] = {
                min: Math.min(current.min, value),
                max: Math.max(current.max, value)
            };
        }
    }

    // Second pass: fill missing attributes with zero so all vertices are aligned
    // and ranges account for implicit zeros.
    for (const vertex of vertices) {
        for (const key of Object.keys(ranges)) {
            if (typeof vertex[key] !== "number") {
                vertex[key] = 0;
            }

            ranges[key].min = Math.min(ranges[key].min, vertex[key]);
            ranges[key].max = Math.max(ranges[key].max, vertex[key]);
        }
    }

    // Normalize any untouched ranges to zero so callers never see infinities.
    for (const [key, range] of Object.entries(ranges)) {
        if (!Number.isFinite(range.min)) {
            ranges[key] = { min: 0, max: 0 };
        }
    }

    return ranges;
}

/**
 * Solve a model with multiple objective functions by optimizing each objective
 * independently, collecting the resulting Pareto vertices, and solving a
 * derived model that targets the midpoint across all objectives.
 */
export default function Polyopt(solver: SolverLike, model: ModelDefinition): PolyoptResult {
    const workingModel = cloneModel(model);
    const objectives = workingModel.optimize as ObjectiveMap;
    const objectiveKeys = Object.keys(objectives);

    if (objectiveKeys.length === 0) {
        throw new Error("Multi-objective solve requires at least one objective definition.");
    }

    // We'll replace optimize/opType repeatedly, so start with a clean slate.
    delete (workingModel as Record<string, unknown>).optimize;
    delete (workingModel as Record<string, unknown>).opType;

    const aggregatedTargets: Record<string, number> = {};
    const uniqueVectors = new Set<string>();
    const paretoVertices: Vertex[] = [];

    for (const key of objectiveKeys) {
        aggregatedTargets[key] = 0;
    }

    for (const objectiveName of objectiveKeys) {
        // Configure the working model to focus solely on the current objective.
        workingModel.optimize = objectiveName;
        workingModel.opType = objectives[objectiveName];

        const solution = solver.Solve(workingModel, undefined, undefined, true);

        // Ensure attributes that are not explicit variables still get values we can compare.
        backfillObjectiveAttributes(solution, workingModel, objectiveKeys);

        const vectorKey = buildVectorKey(solution, objectiveKeys);
        if (uniqueVectors.has(vectorKey)) {
            continue;
        }

        uniqueVectors.add(vectorKey);

        for (const key of objectiveKeys) {
            const value = solution[key];
            if (typeof value === "number") {
                aggregatedTargets[key] += value;
            }
        }

        // Strip metadata so each Pareto vertex only contains value-bearing fields.
        const { feasible, result, bounded, ...paretoPayload } = solution;
        paretoVertices.push(paretoPayload);
    }

    // Derive equality constraints that represent the averaged objective values.
    for (const key of objectiveKeys) {
        workingModel.constraints[key] = { equal: aggregatedTargets[key] / uniqueVectors.size };
    }

    // Add a synthetic objective so the solver has something concrete to maximize.
    const syntheticObjective = `cheater-${Math.random()}`;
    workingModel.optimize = syntheticObjective;
    workingModel.opType = "max";

    for (const variable of Object.values(workingModel.variables)) {
        variable[syntheticObjective] = 1;
    }

    const ranges = computeRanges(paretoVertices);
    const midpoint = solver.Solve(workingModel, undefined, undefined, true);

    return {
        midpoint,
        vertices: paretoVertices,
        ranges
    };
}
