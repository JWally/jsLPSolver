import type Tableau from "./tableau";

export function simplex(this: Tableau): Tableau {
    this.bounded = true;
    this.phase1();

    if (this.feasible === true) {
        this.phase2();
    }

    return this;
}

export function phase1(this: Tableau): number {
    const debugCheckForCycles = this.model.checkForCycles;
    const varIndexesCycle: Array<[number, number]> = [];

    const matrix = this.matrix;
    const rhsColumn = this.rhsColumn;
    const lastColumn = this.width - 1;
    const lastRow = this.height - 1;

    let unrestricted: boolean;
    let iterations = 0;

    while (true) {
        let leavingRowIndex = 0;
        let rhsValue = -this.precision;
        for (let r = 1; r <= lastRow; r++) {
            unrestricted = this.unrestrictedVars[this.varIndexByRow[r]] === true;

            const value = matrix[r][rhsColumn];
            if (value < rhsValue) {
                rhsValue = value;
                leavingRowIndex = r;
            }
        }

        if (leavingRowIndex === 0) {
            this.feasible = true;
            return iterations;
        }

        let enteringColumn = 0;
        let maxQuotient = -Infinity;
        const costRow = matrix[0];
        const leavingRow = matrix[leavingRowIndex];
        for (let c = 1; c <= lastColumn; c++) {
            const coefficient = leavingRow[c];

            unrestricted = this.unrestrictedVars[this.varIndexByCol[c]] === true;
            if (unrestricted || coefficient < -this.precision) {
                const quotient = -costRow[c] / coefficient;
                if (maxQuotient < quotient) {
                    maxQuotient = quotient;
                    enteringColumn = c;
                }
            }
        }

        if (enteringColumn === 0) {
            this.feasible = false;
            return iterations;
        }

        if (debugCheckForCycles) {
            varIndexesCycle.push([this.varIndexByRow[leavingRowIndex], this.varIndexByCol[enteringColumn]]);

            const cycleData = this.checkForCycles(varIndexesCycle);
            if (cycleData.length > 0) {
                this.model.messages.push("Cycle in phase 1");
                this.model.messages.push("Start :" + cycleData[0]);
                this.model.messages.push("Length :" + cycleData[1]);

                this.feasible = false;
                return iterations;
            }
        }

        this.pivot(leavingRowIndex, enteringColumn);
        iterations += 1;
    }
}

export function phase2(this: Tableau): number {
    const debugCheckForCycles = this.model.checkForCycles;
    const varIndexesCycle: Array<[number, number]> = [];

    const matrix = this.matrix;
    const rhsColumn = this.rhsColumn;
    const lastColumn = this.width - 1;
    const lastRow = this.height - 1;

    const precision = this.precision;
    const nOptionalObjectives = this.optionalObjectives.length;
    let optionalCostsColumns: number[] | null = null;

    let iterations = 0;
    let reducedCost: number;
    let unrestricted: boolean;

    while (true) {
        const costRow = matrix[this.costRowIndex];

        if (nOptionalObjectives > 0) {
            optionalCostsColumns = [];
        }

        let enteringColumn = 0;
        let enteringValue = precision;
        let isReducedCostNegative = false;
        for (let c = 1; c <= lastColumn; c++) {
            reducedCost = costRow[c];
            unrestricted = this.unrestrictedVars[this.varIndexByCol[c]] === true;

            if (nOptionalObjectives > 0 && -precision < reducedCost && reducedCost < precision) {
                optionalCostsColumns?.push(c);
                continue;
            }

            if (unrestricted && reducedCost < 0) {
                if (-reducedCost > enteringValue) {
                    enteringValue = -reducedCost;
                    enteringColumn = c;
                    isReducedCostNegative = true;
                }
                continue;
            }

            if (reducedCost > enteringValue) {
                enteringValue = reducedCost;
                enteringColumn = c;
                isReducedCostNegative = false;
            }
        }

        if (nOptionalObjectives > 0) {
            let o = 0;
            while (enteringColumn === 0 && optionalCostsColumns && optionalCostsColumns.length > 0 && o < nOptionalObjectives) {
                const optionalCostsColumns2: number[] = [];
                const reducedCosts = this.optionalObjectives[o].reducedCosts;

                enteringValue = precision;

                for (let i = 0; i < optionalCostsColumns.length; i++) {
                    const c = optionalCostsColumns[i];

                    reducedCost = reducedCosts[c];
                    unrestricted = this.unrestrictedVars[this.varIndexByCol[c]] === true;

                    if (-precision < reducedCost && reducedCost < precision) {
                        optionalCostsColumns2.push(c);
                        continue;
                    }

                    if (unrestricted && reducedCost < 0) {
                        if (-reducedCost > enteringValue) {
                            enteringValue = -reducedCost;
                            enteringColumn = c;
                            isReducedCostNegative = true;
                        }
                        continue;
                    }

                    if (reducedCost > enteringValue) {
                        enteringValue = reducedCost;
                        enteringColumn = c;
                        isReducedCostNegative = false;
                    }
                }
                optionalCostsColumns = optionalCostsColumns2;
                o += 1;
            }
        }

        if (enteringColumn === 0) {
            this.setEvaluation();
            this.simplexIters += 1;
            return iterations;
        }

        let leavingRow = 0;
        let minQuotient = Infinity;

        const varIndexByRow = this.varIndexByRow;

        for (let r = 1; r <= lastRow; r++) {
            const row = matrix[r];
            const rhsValue = row[rhsColumn];
            const colValue = row[enteringColumn];

            if (-precision < colValue && colValue < precision) {
                continue;
            }

            if (colValue > 0 && precision > rhsValue && rhsValue > -precision) {
                minQuotient = 0;
                leavingRow = r;
                break;
            }

            const quotient = isReducedCostNegative ? -rhsValue / colValue : rhsValue / colValue;
            if (quotient > precision && minQuotient > quotient) {
                minQuotient = quotient;
                leavingRow = r;
            }
        }

        if (minQuotient === Infinity) {
            this.evaluation = -Infinity;
            this.bounded = false;
            this.unboundedVarIndex = this.varIndexByCol[enteringColumn];
            return iterations;
        }

        if (debugCheckForCycles) {
            varIndexesCycle.push([this.varIndexByRow[leavingRow], this.varIndexByCol[enteringColumn]]);

            const cycleData = this.checkForCycles(varIndexesCycle);
            if (cycleData.length > 0) {
                this.model.messages.push("Cycle in phase 2");
                this.model.messages.push("Start :" + cycleData[0]);
                this.model.messages.push("Length :" + cycleData[1]);

                this.feasible = false;
                return iterations;
            }
        }

        this.pivot(leavingRow, enteringColumn);
        iterations += 1;
    }
}

const nonZeroColumns: number[] = [];

export function pivot(this: Tableau, pivotRowIndex: number, pivotColumnIndex: number): void {
    const matrix = this.matrix;

    const quotient = matrix[pivotRowIndex][pivotColumnIndex];

    const lastRow = this.height - 1;
    const lastColumn = this.width - 1;

    const leavingBasicIndex = this.varIndexByRow[pivotRowIndex];
    const enteringBasicIndex = this.varIndexByCol[pivotColumnIndex];

    this.varIndexByRow[pivotRowIndex] = enteringBasicIndex;
    this.varIndexByCol[pivotColumnIndex] = leavingBasicIndex;

    this.rowByVarIndex[enteringBasicIndex] = pivotRowIndex;
    this.rowByVarIndex[leavingBasicIndex] = -1;

    this.colByVarIndex[enteringBasicIndex] = -1;
    this.colByVarIndex[leavingBasicIndex] = pivotColumnIndex;

    const pivotRow = matrix[pivotRowIndex];
    let nNonZeroColumns = 0;
    for (let c = 0; c <= lastColumn; c++) {
        if (!(pivotRow[c] >= -1e-16 && pivotRow[c] <= 1e-16)) {
            pivotRow[c] /= quotient;
            nonZeroColumns[nNonZeroColumns] = c;
            nNonZeroColumns += 1;
        } else {
            pivotRow[c] = 0;
        }
    }
    pivotRow[pivotColumnIndex] = 1 / quotient;

    let coefficient: number;
    let i: number;
    let v0: number;
    for (let r = 0; r <= lastRow; r++) {
        if (r !== pivotRowIndex) {
            if (!(matrix[r][pivotColumnIndex] >= -1e-16 && matrix[r][pivotColumnIndex] <= 1e-16)) {
                const row = matrix[r];

                coefficient = row[pivotColumnIndex];

                if (!(coefficient >= -1e-16 && coefficient <= 1e-16)) {
                    for (i = 0; i < nNonZeroColumns; i++) {
                        const c = nonZeroColumns[i];
                        v0 = pivotRow[c];
                        if (!(v0 >= -1e-16 && v0 <= 1e-16)) {
                            row[c] = row[c] - coefficient * v0;
                        } else if (v0 !== 0) {
                            pivotRow[c] = 0;
                        }
                    }

                    row[pivotColumnIndex] = -coefficient / quotient;
                } else if (coefficient !== 0) {
                    row[pivotColumnIndex] = 0;
                }
            }
        }
    }

    const nOptionalObjectives = this.optionalObjectives.length;
    if (nOptionalObjectives > 0) {
        for (let o = 0; o < nOptionalObjectives; o += 1) {
            const reducedCosts = this.optionalObjectives[o].reducedCosts;
            coefficient = reducedCosts[pivotColumnIndex];
            if (coefficient !== 0) {
                for (i = 0; i < nNonZeroColumns; i++) {
                    const c = nonZeroColumns[i];
                    v0 = pivotRow[c];
                    if (v0 !== 0) {
                        reducedCosts[c] = reducedCosts[c] - coefficient * v0;
                    }
                }

                reducedCosts[pivotColumnIndex] = -coefficient / quotient;
            }
        }
    }
}

export function checkForCycles(this: Tableau, varIndexes: Array<[number, number]>): number[] {
    for (let e1 = 0; e1 < varIndexes.length - 1; e1++) {
        for (let e2 = e1 + 1; e2 < varIndexes.length; e2++) {
            const elt1 = varIndexes[e1];
            const elt2 = varIndexes[e2];
            if (elt1[0] === elt2[0] && elt1[1] === elt2[1]) {
                if (e2 - e1 > varIndexes.length - e2) {
                    break;
                }
                let cycleFound = true;
                for (let i = 1; i < e2 - e1; i++) {
                    const tmp1 = varIndexes[e1 + i];
                    const tmp2 = varIndexes[e2 + i];
                    if (tmp1[0] !== tmp2[0] || tmp1[1] !== tmp2[1]) {
                        cycleFound = false;
                        break;
                    }
                }
                if (cycleFound) {
                    return [e1, e2 - e1];
                }
            }
        }
    }
    return [];
}
