/**
 * @file src/tableau/backup.ts
 * @description Tableau state backup and restoration
 *
 * Provides functions to snapshot and restore tableau state during
 * branch-and-bound exploration. Essential for backtracking when
 * a branch is pruned or found infeasible.
 *
 * Functions are designed to be bound to a Tableau instance via `this`.
 */
import type Tableau from "./tableau";
import { captureBounds, restoreBounds, type BoundState } from "./bounds";

/**
 * Create a deep copy of this tableau's state.
 *
 * Copies all mutable state (matrix, index arrays, optional objectives) while
 * sharing immutable references (variables, model). The matrix is copied using
 * the Float64Array constructor for maximum speed.
 *
 * @returns A new Tableau instance with identical state.
 */
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

    restoreBounds(copy, captureBounds(this));

    return copy;
}

/**
 * Snapshot the current tableau state for later restoration.
 * Used before branch-and-cut to establish a root state that branches can revert to.
 */
export function save(this: Tableau): void {
    this.savedState = this.copy();
}

/**
 * Restore the tableau to the previously saved state.
 *
 * Copies all mutable arrays from the saved snapshot back into the current tableau.
 * Uses `Float64Array.set()` for efficient matrix restoration and explicit loops
 * for index arrays to avoid allocation.
 *
 * No-op if no state has been saved.
 */
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
    const height = this.height;
    for (let c = 0; c < height; c += 1) {
        this.varIndexByRow[c] = savedBasicIndexes[c];
    }
    this.varIndexByRow.length = height;

    const savedNonBasicIndexes = save.varIndexByCol;
    const width = this.width;
    for (let r = 0; r < width; r += 1) {
        this.varIndexByCol[r] = savedNonBasicIndexes[r];
    }
    this.varIndexByCol.length = width;

    const savedRows = save.rowByVarIndex;
    const savedCols = save.colByVarIndex;
    for (let v = 0; v < this.nVars; v += 1) {
        this.rowByVarIndex[v] = savedRows[v];
        this.colByVarIndex[v] = savedCols[v];
    }

    restoreBounds(this, captureBounds(save));

    if (save.optionalObjectives.length > 0 && this.optionalObjectives.length > 0) {
        this.optionalObjectives = [];
        this.optionalObjectivePerPriority = {};
        for (let o = 0; o < save.optionalObjectives.length; o++) {
            const optionalObjectiveCopy = save.optionalObjectives[o].copy();
            this.optionalObjectives[o] = optionalObjectiveCopy;
            this.optionalObjectivePerPriority[optionalObjectiveCopy.priority] =
                optionalObjectiveCopy;
            this.objectivesByPriority[optionalObjectiveCopy.priority] = optionalObjectiveCopy;
        }
    }
}

/**
 * Lightweight copy of the LP state at a branch-and-cut node: the live rows
 * of the matrix plus the basis bookkeeping. Variables, model and optional
 * objectives are shared with the tableau and not captured.
 */
export interface NodeSnapshot {
    matrix: Float64Array;
    height: number;
    nVars: number;
    lastElementIndex: number;
    varIndexByRow: number[];
    varIndexByCol: number[];
    rowByVarIndex: number[];
    colByVarIndex: number[];
    availableIndexes: number[];
    bounds: BoundState | null;
}

/**
 * Capture the current node's LP state so a queued child can later resume
 * from it instead of re-solving from the root.
 */
export function snapshot(this: Tableau, reuse: NodeSnapshot | null = null): NodeSnapshot {
    const cells = this.height * this.width;
    let matrix: Float64Array;
    if (reuse !== null && reuse.matrix.length === cells) {
        matrix = reuse.matrix;
        matrix.set(this.matrix.subarray(0, cells));
    } else {
        matrix = this.matrix.slice(0, cells);
    }
    const copyInto = (source: number[], length: number, target: number[] | undefined) => {
        if (target === undefined) return source.slice(0, length);
        for (let i = 0; i < length; i++) target[i] = source[i];
        target.length = length;
        return target;
    };
    return {
        matrix,
        height: this.height,
        nVars: this.nVars,
        lastElementIndex: this.lastElementIndex,
        varIndexByRow: copyInto(this.varIndexByRow, this.height, reuse?.varIndexByRow),
        varIndexByCol: copyInto(this.varIndexByCol, this.width, reuse?.varIndexByCol),
        rowByVarIndex: copyInto(this.rowByVarIndex, this.nVars, reuse?.rowByVarIndex),
        colByVarIndex: copyInto(this.colByVarIndex, this.nVars, reuse?.colByVarIndex),
        availableIndexes: this.availableIndexes.slice(),
        bounds: captureBounds(this, reuse?.bounds ?? null),
    };
}

/**
 * Load a state captured by `snapshot`. The width must not have changed.
 */
export function loadSnapshot(this: Tableau, snap: NodeSnapshot): void {
    if (this.matrix.length < snap.matrix.length) {
        this.matrix = new Float64Array(Math.ceil(snap.matrix.length * 1.5));
    }
    this.matrix.set(snap.matrix);
    this.height = snap.height;
    this.nVars = snap.nVars;
    this.lastElementIndex = snap.lastElementIndex;

    const varIndexByRow = this.varIndexByRow;
    for (let r = 0; r < snap.height; r++) varIndexByRow[r] = snap.varIndexByRow[r];
    varIndexByRow.length = snap.height;

    const varIndexByCol = this.varIndexByCol;
    for (let c = 0; c < snap.varIndexByCol.length; c++) varIndexByCol[c] = snap.varIndexByCol[c];

    const rowByVarIndex = this.rowByVarIndex;
    const colByVarIndex = this.colByVarIndex;
    for (let v = 0; v < snap.nVars; v++) {
        rowByVarIndex[v] = snap.rowByVarIndex[v];
        colByVarIndex[v] = snap.colByVarIndex[v];
    }
    this.availableIndexes = snap.availableIndexes.slice();
    restoreBounds(this, snap.bounds);
}
