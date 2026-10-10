/**
 * @file src/tableau/pseudocosts.ts
 * @description Pseudocosts for branching-variable selection
 *
 * A pseudocost is the average objective degradation per unit of change when
 * a variable is branched on in one direction (Bénichou et al. 1971). Branching
 * on x = 2.3 down moves it by f = 0.3 and up by 1 - f = 0.7; if the child's
 * LP bound worsens by g, the observation is g / f (down) or g / (1 - f) (up).
 *
 * Candidates are scored with the product rule (Achterberg 2007, ch. 5):
 * max(down gain, eps) * max(up gain, eps), which prefers variables that
 * degrade both children over ones that degrade only one.
 */

/** Observations per direction before a pseudocost is trusted (SCIP's default η_rel is 8). */
export const RELIABILITY = 4;

const SCORE_EPS = 1e-6;

export class Pseudocosts {
    private upSum: Float64Array;
    private upCount: Int32Array;
    private downSum: Float64Array;
    private downCount: Int32Array;
    private totalUp = 0;
    private totalUpCount = 0;
    private totalDown = 0;
    private totalDownCount = 0;

    constructor(nVars: number) {
        this.upSum = new Float64Array(nVars);
        this.upCount = new Int32Array(nVars);
        this.downSum = new Float64Array(nVars);
        this.downCount = new Int32Array(nVars);
    }

    /**
     * Record one branching observation.
     * @param distance - How far the branch moved the variable (f down, 1 - f up).
     * @param gain - Child bound minus parent bound (>= 0 in the minimization form).
     */
    record(varIndex: number, up: boolean, distance: number, gain: number): void {
        if (!(distance > 1e-9) || !Number.isFinite(gain)) return;
        const perUnit = Math.max(0, gain) / distance;
        if (up) {
            this.upSum[varIndex] += perUnit;
            this.upCount[varIndex]++;
            this.totalUp += perUnit;
            this.totalUpCount++;
        } else {
            this.downSum[varIndex] += perUnit;
            this.downCount[varIndex]++;
            this.totalDown += perUnit;
            this.totalDownCount++;
        }
    }

    /** Fewer observations of the two directions. */
    reliability(varIndex: number): number {
        return Math.min(this.upCount[varIndex], this.downCount[varIndex]);
    }

    /** Per-unit up pseudocost; the average over all variables if none observed yet. */
    up(varIndex: number): number {
        const n = this.upCount[varIndex];
        if (n > 0) return this.upSum[varIndex] / n;
        return this.totalUpCount > 0 ? this.totalUp / this.totalUpCount : 1;
    }

    /** Per-unit down pseudocost; the average over all variables if none observed yet. */
    down(varIndex: number): number {
        const n = this.downCount[varIndex];
        if (n > 0) return this.downSum[varIndex] / n;
        return this.totalDownCount > 0 ? this.totalDown / this.totalDownCount : 1;
    }

    /** Product-rule score of branching on a variable with fractional part f. */
    score(varIndex: number, f: number): number {
        return productScore(this.down(varIndex) * f, this.up(varIndex) * (1 - f));
    }
}

/** Product rule over the two children's (estimated or measured) gains. */
export function productScore(downGain: number, upGain: number): number {
    return Math.max(downGain, SCORE_EPS) * Math.max(upGain, SCORE_EPS);
}
