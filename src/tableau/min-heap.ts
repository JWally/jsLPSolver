/**
 * @file src/tableau/min-heap.ts
 * @description Priority queue for branch-and-bound node selection
 *
 * Implements a binary min-heap optimized for extracting the most
 * promising branch (lowest relaxed objective). Uses a flat array
 * for cache efficiency and LIFO tie-breaking.
 *
 * This replaces sorting the branch list on every iteration,
 * reducing complexity from O(n log n) to O(log n) per operation.
 */
import type { Branch } from "./types";

/** Internal entry pairing a branch with its insertion sequence number for LIFO tie-breaking. */
interface HeapEntry {
    branch: Branch;
    seq: number;
}

/**
 * Binary min-heap for branch-and-bound node selection.
 *
 * Orders branches by relaxed objective value (lowest first), with LIFO
 * tie-breaking so that more recently created nodes are explored first
 * when evaluations are equal. This mimics depth-first behavior in ties.
 *
 * Uses a flat array for cache efficiency and an object pool to reduce
 * garbage collection pressure during intensive B&B traversals.
 */
export class BranchMinHeap {
    /** Flat array storing heap entries in tree order. */
    private heap: HeapEntry[];
    /** Number of entries currently in the heap. */
    private size: number;
    /** Monotonically increasing counter for LIFO tie-breaking. */
    private seqCounter: number;
    /** Object pool for reusing HeapEntry objects. */
    private pool: HeapEntry[];
    /** Current number of entries in the pool. */
    private poolSize: number;

    /**
     * @param initialCapacity - Pre-allocated array size (grows automatically if exceeded).
     */
    constructor(initialCapacity = 64) {
        this.heap = new Array(initialCapacity);
        this.size = 0;
        this.seqCounter = 0;
        this.pool = new Array(64);
        this.poolSize = 0;
    }

    /** Allocate a HeapEntry, reusing from the pool if available. */
    private allocEntry(branch: Branch, seq: number): HeapEntry {
        if (this.poolSize > 0) {
            const entry = this.pool[--this.poolSize];
            entry.branch = branch;
            entry.seq = seq;
            return entry;
        }
        return { branch, seq };
    }

    /** Return a HeapEntry to the pool for reuse (capped at 256 entries). */
    private freeEntry(entry: HeapEntry): void {
        if (this.poolSize < 256) {
            this.pool[this.poolSize++] = entry;
        }
    }

    /** Number of branches currently in the heap. */
    get length(): number {
        return this.size;
    }

    /** Whether the heap contains no branches. */
    isEmpty(): boolean {
        return this.size === 0;
    }

    /** Remove all entries and reset the sequence counter. */
    clear(): void {
        this.size = 0;
        this.seqCounter = 0;
    }

    /**
     * Compare two entries for priority ordering.
     * @returns True if `a` should be extracted before `b`.
     */
    private isBefore(a: HeapEntry, b: HeapEntry): boolean {
        if (a.branch.relaxedEvaluation !== b.branch.relaxedEvaluation) {
            return a.branch.relaxedEvaluation < b.branch.relaxedEvaluation;
        }
        // LIFO tie-breaking: higher seq (more recent) comes first
        return a.seq > b.seq;
    }

    /**
     * Insert a branch into the heap. O(log n).
     * @param branch - The B&B node to insert.
     */
    push(branch: Branch): void {
        const heap = this.heap;
        let idx = this.size;
        this.size++;

        // Grow if needed
        if (idx >= heap.length) {
            heap.length = heap.length * 2;
        }

        const entry = this.allocEntry(branch, this.seqCounter++);

        // Bubble up
        while (idx > 0) {
            const parentIdx = (idx - 1) >> 1;
            const parent = heap[parentIdx];
            if (!this.isBefore(entry, parent)) {
                break;
            }
            heap[idx] = parent;
            idx = parentIdx;
        }
        heap[idx] = entry;
    }

    /**
     * Remove and return the highest-priority branch (lowest relaxed evaluation). O(log n).
     * @returns The most promising branch, or undefined if empty.
     */
    pop(): Branch | undefined {
        if (this.size === 0) {
            return undefined;
        }

        const heap = this.heap;
        const poppedEntry = heap[0];
        const result = poppedEntry.branch;
        this.size--;

        // Return entry to pool
        this.freeEntry(poppedEntry);

        if (this.size === 0) {
            return result;
        }

        // Move last element to root and bubble down
        const last = heap[this.size];
        let idx = 0;
        const halfSize = this.size >> 1;

        while (idx < halfSize) {
            let childIdx = (idx << 1) + 1;
            let child = heap[childIdx];
            const rightIdx = childIdx + 1;

            if (rightIdx < this.size && this.isBefore(heap[rightIdx], child)) {
                childIdx = rightIdx;
                child = heap[rightIdx];
            }

            if (!this.isBefore(child, last)) {
                break;
            }

            heap[idx] = child;
            idx = childIdx;
        }

        heap[idx] = last;
        return result;
    }

    /**
     * View the highest-priority branch without removing it. O(1).
     * @returns The most promising branch, or undefined if empty.
     */
    peek(): Branch | undefined {
        return this.size > 0 ? this.heap[0].branch : undefined;
    }
}
