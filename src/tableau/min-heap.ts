import type { Branch } from "./types";

interface HeapEntry {
    branch: Branch;
    seq: number;
}

/**
 * Min-heap implementation for branch-and-bound priority queue.
 * Optimized for the common case of extracting the minimum evaluation branch.
 * Uses a binary heap stored in a flat array for cache efficiency.
 * Tie-breaking uses LIFO order (higher seq = inserted later = extracted first on tie)
 * to match the original array.sort + pop behavior.
 */
export class BranchMinHeap {
    private heap: HeapEntry[];
    private size: number;
    private seqCounter: number;

    constructor(initialCapacity = 64) {
        this.heap = new Array(initialCapacity);
        this.size = 0;
        this.seqCounter = 0;
    }

    get length(): number {
        return this.size;
    }

    isEmpty(): boolean {
        return this.size === 0;
    }

    clear(): void {
        this.size = 0;
        this.seqCounter = 0;
    }

    // Compare: returns true if a should be before b (a has higher priority)
    private isBefore(a: HeapEntry, b: HeapEntry): boolean {
        if (a.branch.relaxedEvaluation !== b.branch.relaxedEvaluation) {
            return a.branch.relaxedEvaluation < b.branch.relaxedEvaluation;
        }
        // LIFO tie-breaking: higher seq (more recent) comes first
        return a.seq > b.seq;
    }

    push(branch: Branch): void {
        const heap = this.heap;
        let idx = this.size;
        this.size++;

        // Grow if needed
        if (idx >= heap.length) {
            heap.length = heap.length * 2;
        }

        const entry: HeapEntry = { branch, seq: this.seqCounter++ };

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

    pop(): Branch | undefined {
        if (this.size === 0) {
            return undefined;
        }

        const heap = this.heap;
        const result = heap[0].branch;
        this.size--;

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

    peek(): Branch | undefined {
        return this.size > 0 ? this.heap[0].branch : undefined;
    }
}
