import type Tableau from "./tableau";

export function copy(this: Tableau): Tableau {
    const copy = new (this.constructor as typeof Tableau)(this.precision, this.branchAndCutService);

    copy.width = this.width;
    copy.height = this.height;

    copy.nVars = this.nVars;
    copy.model = this.model;

    copy.variables = this.variables;
    copy.variablesPerIndex = this.variablesPerIndex;
    copy.unrestrictedVars = this.unrestrictedVars;
    copy.lastElementIndex = this.lastElementIndex;

    copy.varIndexByRow = this.varIndexByRow.slice();
    copy.varIndexByCol = this.varIndexByCol.slice();

    copy.rowByVarIndex = this.rowByVarIndex.slice();
    copy.colByVarIndex = this.colByVarIndex.slice();

    copy.availableIndexes = this.availableIndexes.slice();

    const optionalObjectivesCopy = [];
    for (let o = 0; o < this.optionalObjectives.length; o++) {
        optionalObjectivesCopy[o] = this.optionalObjectives[o].copy();
    }
    copy.optionalObjectives = optionalObjectivesCopy;
    copy.objectivesByPriority = { ...this.objectivesByPriority };
    copy.optionalObjectivePerPriority = { ...this.optionalObjectivePerPriority };

    // Fast Float64Array copy using constructor
    copy.matrix = new Float64Array(this.matrix);

    return copy;
}

export function save(this: Tableau): void {
    this.savedState = this.copy();
}

export function restore(this: Tableau): void {
    if (this.savedState === null) {
        return;
    }

    const save = this.savedState;
    this.nVars = save.nVars;
    this.model = save.model;

    this.variables = save.variables;
    this.variablesPerIndex = save.variablesPerIndex;
    this.unrestrictedVars = save.unrestrictedVars;
    this.lastElementIndex = save.lastElementIndex;

    this.width = save.width;
    this.height = save.height;

    // Fast Float64Array restore using set()
    this.matrix.set(save.matrix);

    const savedBasicIndexes = save.varIndexByRow;
    for (let c = 0; c < this.height; c += 1) {
        this.varIndexByRow[c] = savedBasicIndexes[c];
    }

    while (this.varIndexByRow.length > this.height) {
        this.varIndexByRow.pop();
    }

    const savedNonBasicIndexes = save.varIndexByCol;
    for (let r = 0; r < this.width; r += 1) {
        this.varIndexByCol[r] = savedNonBasicIndexes[r];
    }

    while (this.varIndexByCol.length > this.width) {
        this.varIndexByCol.pop();
    }

    const savedRows = save.rowByVarIndex;
    const savedCols = save.colByVarIndex;
    for (let v = 0; v < this.nVars; v += 1) {
        this.rowByVarIndex[v] = savedRows[v];
        this.colByVarIndex[v] = savedCols[v];
    }

    if (save.optionalObjectives.length > 0 && this.optionalObjectives.length > 0) {
        this.optionalObjectives = [];
        this.optionalObjectivePerPriority = {};
        for (let o = 0; o < save.optionalObjectives.length; o++) {
            const optionalObjectiveCopy = save.optionalObjectives[o].copy();
            this.optionalObjectives[o] = optionalObjectiveCopy;
            this.optionalObjectivePerPriority[optionalObjectiveCopy.priority] = optionalObjectiveCopy;
            this.objectivesByPriority[optionalObjectiveCopy.priority] = optionalObjectiveCopy;
        }
    }
}
