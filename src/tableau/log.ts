import type Tableau from "./tableau";

export function log(this: Tableau, message: unknown, force?: boolean): Tableau {
    if (false && !force) {
        return this;
    }

    // eslint-disable-next-line no-console
    console.log("****", message, "****");
    // eslint-disable-next-line no-console
    console.log("Nb Variables", this.width - 1);
    // eslint-disable-next-line no-console
    console.log("Nb Constraints", this.height - 1);
    // console.log("Variable Ids", this.variablesPerIndex);
    // eslint-disable-next-line no-console
    console.log("Basic Indexes", this.varIndexByRow);
    // eslint-disable-next-line no-console
    console.log("Non Basic Indexes", this.varIndexByCol);
    // eslint-disable-next-line no-console
    console.log("Rows", this.rowByVarIndex);
    // eslint-disable-next-line no-console
    console.log("Cols", this.colByVarIndex);

    const digitPrecision = 5;
    const matrix = this.matrix;
    const width = this.width;

    let varNameRowString = "";
    const spacePerColumn: string[] = [" "];
    let j: number;
    let c: number;
    let varIndex: number;
    let varName: string;
    let varNameLength: number;
    let valueSpace: string;
    let nameSpace: string;

    for (c = 1; c < this.width; c += 1) {
        varIndex = this.varIndexByCol[c];
        const variable = this.variablesPerIndex[varIndex];
        if (variable === undefined) {
            varName = "c" + varIndex;
        } else {
            varName = variable.id;
        }

        varNameLength = varName.length;
        valueSpace = " ";
        nameSpace = "\t";

        if (varNameLength > 5) {
            valueSpace += " ";
        } else {
            nameSpace += "\t";
        }

        spacePerColumn[c] = valueSpace;

        varNameRowString += nameSpace + varName;
    }
    // eslint-disable-next-line no-console
    console.log(varNameRowString);

    let signSpace: string;

    const costRowOffset = this.costRowIndex * width;
    let firstRowString = "\t";

    for (j = 1; j < this.width; j += 1) {
        signSpace = "\t";
        firstRowString += signSpace;
        firstRowString += spacePerColumn[j];
        firstRowString += matrix[costRowOffset + j].toFixed(digitPrecision);
    }
    signSpace = "\t";
    firstRowString += signSpace + spacePerColumn[0] + matrix[costRowOffset].toFixed(digitPrecision);
    // eslint-disable-next-line no-console
    console.log(firstRowString + "\tZ");

    for (let r = 1; r < this.height; r += 1) {
        const rowOffset = r * width;
        let rowString = "\t";

        for (c = 1; c < this.width; c += 1) {
            signSpace = "\t";
            rowString += signSpace + spacePerColumn[c] + matrix[rowOffset + c].toFixed(digitPrecision);
        }
        signSpace = "\t";
        rowString += signSpace + spacePerColumn[0] + matrix[rowOffset].toFixed(digitPrecision);

        varIndex = this.varIndexByRow[r];
        const variable = this.variablesPerIndex[varIndex];
        if (variable === undefined) {
            varName = "c" + varIndex;
        } else {
            varName = variable.id;
        }
        // eslint-disable-next-line no-console
        console.log(rowString + "\t" + varName);
    }
    // eslint-disable-next-line no-console
    console.log("");

    const nOptionalObjectives = this.optionalObjectives.length;
    if (nOptionalObjectives > 0) {
        // eslint-disable-next-line no-console
        console.log("    Optional objectives:");
        for (let o = 0; o < nOptionalObjectives; o += 1) {
            const reducedCosts = this.optionalObjectives[o].reducedCosts;
            let reducedCostsString = "";
            for (j = 1; j < this.width; j += 1) {
                signSpace = reducedCosts[j] < 0 ? "" : " ";
                reducedCostsString += signSpace;
                reducedCostsString += spacePerColumn[j];
                reducedCostsString += reducedCosts[j].toFixed(digitPrecision);
            }
            signSpace = reducedCosts[0] < 0 ? "" : " ";
            reducedCostsString += signSpace + spacePerColumn[0] + reducedCosts[0].toFixed(digitPrecision);
            // eslint-disable-next-line no-console
            console.log(reducedCostsString + " z" + o);
        }
    }
    // eslint-disable-next-line no-console
    console.log("Feasible?", this.feasible);
    // eslint-disable-next-line no-console
    console.log("evaluation", this.evaluation);

    return this;
}
