import { describe, it, expect, beforeEach } from "vitest";
import { BranchMinHeap } from "./min-heap";
import type { Branch } from "./types";

/**
 * Helper to create a Branch with the given relaxed evaluation
 */
function createBranch(relaxedEvaluation: number): Branch {
    return { relaxedEvaluation, cuts: [] };
}

describe("BranchMinHeap", () => {
    let heap: BranchMinHeap;

    beforeEach(() => {
        heap = new BranchMinHeap();
    });

    describe("constructor", () => {
        it("creates an empty heap with default capacity", () => {
            expect(heap.length).toBe(0);
            expect(heap.isEmpty()).toBe(true);
        });

        it("creates an empty heap with custom initial capacity", () => {
            const customHeap = new BranchMinHeap(128);
            expect(customHeap.length).toBe(0);
            expect(customHeap.isEmpty()).toBe(true);
        });
    });

    describe("length property", () => {
        it("returns 0 for empty heap", () => {
            expect(heap.length).toBe(0);
        });

        it("returns correct count after pushes", () => {
            heap.push(createBranch(1));
            expect(heap.length).toBe(1);

            heap.push(createBranch(2));
            expect(heap.length).toBe(2);

            heap.push(createBranch(3));
            expect(heap.length).toBe(3);
        });

        it("returns correct count after pops", () => {
            heap.push(createBranch(1));
            heap.push(createBranch(2));
            heap.push(createBranch(3));

            heap.pop();
            expect(heap.length).toBe(2);

            heap.pop();
            expect(heap.length).toBe(1);

            heap.pop();
            expect(heap.length).toBe(0);
        });
    });

    describe("isEmpty", () => {
        it("returns true for new heap", () => {
            expect(heap.isEmpty()).toBe(true);
        });

        it("returns false after push", () => {
            heap.push(createBranch(1));
            expect(heap.isEmpty()).toBe(false);
        });

        it("returns true after popping all elements", () => {
            heap.push(createBranch(1));
            heap.pop();
            expect(heap.isEmpty()).toBe(true);
        });
    });

    describe("clear", () => {
        it("empties the heap", () => {
            heap.push(createBranch(1));
            heap.push(createBranch(2));
            heap.push(createBranch(3));

            heap.clear();

            expect(heap.length).toBe(0);
            expect(heap.isEmpty()).toBe(true);
        });

        it("allows new pushes after clear", () => {
            heap.push(createBranch(1));
            heap.clear();
            heap.push(createBranch(5));

            expect(heap.length).toBe(1);
            expect(heap.peek()?.relaxedEvaluation).toBe(5);
        });
    });

    describe("push", () => {
        it("adds a single element", () => {
            const branch = createBranch(5);
            heap.push(branch);

            expect(heap.length).toBe(1);
            expect(heap.peek()).toBe(branch);
        });

        it("maintains min-heap property: smallest relaxed evaluation at top", () => {
            heap.push(createBranch(10));
            heap.push(createBranch(5));
            heap.push(createBranch(15));
            heap.push(createBranch(1));
            heap.push(createBranch(8));

            expect(heap.peek()?.relaxedEvaluation).toBe(1);
        });

        it("grows capacity when exceeding initial size", () => {
            const smallHeap = new BranchMinHeap(2);

            // Push more than initial capacity
            for (let i = 0; i < 10; i++) {
                smallHeap.push(createBranch(i));
            }

            expect(smallHeap.length).toBe(10);
            expect(smallHeap.peek()?.relaxedEvaluation).toBe(0);
        });
    });

    describe("pop", () => {
        it("returns undefined from empty heap", () => {
            expect(heap.pop()).toBeUndefined();
        });

        it("returns and removes the minimum element", () => {
            heap.push(createBranch(10));
            heap.push(createBranch(5));
            heap.push(createBranch(15));

            const min = heap.pop();
            expect(min?.relaxedEvaluation).toBe(5);
            expect(heap.length).toBe(2);
        });

        it("returns elements in sorted order (min first)", () => {
            heap.push(createBranch(30));
            heap.push(createBranch(10));
            heap.push(createBranch(20));
            heap.push(createBranch(5));
            heap.push(createBranch(25));

            const results: number[] = [];
            while (!heap.isEmpty()) {
                results.push(heap.pop()!.relaxedEvaluation);
            }

            expect(results).toEqual([5, 10, 20, 25, 30]);
        });

        it("handles single element heap", () => {
            const branch = createBranch(42);
            heap.push(branch);

            const popped = heap.pop();
            expect(popped).toBe(branch);
            expect(heap.isEmpty()).toBe(true);
        });
    });

    describe("peek", () => {
        it("returns undefined from empty heap", () => {
            expect(heap.peek()).toBeUndefined();
        });

        it("returns the minimum element without removing it", () => {
            heap.push(createBranch(10));
            heap.push(createBranch(5));

            expect(heap.peek()?.relaxedEvaluation).toBe(5);
            expect(heap.length).toBe(2); // Still 2 elements
        });

        it("returns same element on consecutive peeks", () => {
            heap.push(createBranch(7));

            const first = heap.peek();
            const second = heap.peek();

            expect(first).toBe(second);
        });
    });

    describe("LIFO tie-breaking", () => {
        it("returns more recently pushed branch when relaxed evaluations are equal", () => {
            const first = createBranch(5);
            const second = createBranch(5);
            const third = createBranch(5);

            heap.push(first);
            heap.push(second);
            heap.push(third);

            // LIFO: third should come out first (most recent)
            expect(heap.pop()).toBe(third);
            expect(heap.pop()).toBe(second);
            expect(heap.pop()).toBe(first);
        });

        it("combines min-heap and LIFO correctly", () => {
            // Push branches with same and different evaluations
            const a = createBranch(10);
            const b = createBranch(5);
            const c = createBranch(5); // Same as b
            const d = createBranch(3);

            heap.push(a); // seq 0
            heap.push(b); // seq 1
            heap.push(c); // seq 2, same eval as b
            heap.push(d); // seq 3

            // d (3) is smallest, comes first
            expect(heap.pop()).toBe(d);
            // c and b both have eval 5, but c has higher seq (more recent)
            expect(heap.pop()).toBe(c);
            expect(heap.pop()).toBe(b);
            // a (10) is largest
            expect(heap.pop()).toBe(a);
        });
    });

    describe("heap property maintenance", () => {
        it("maintains heap property after many operations", () => {
            // Interleave pushes and pops
            heap.push(createBranch(50));
            heap.push(createBranch(30));
            expect(heap.pop()?.relaxedEvaluation).toBe(30);

            heap.push(createBranch(20));
            heap.push(createBranch(40));
            expect(heap.pop()?.relaxedEvaluation).toBe(20);

            heap.push(createBranch(10));
            expect(heap.pop()?.relaxedEvaluation).toBe(10);

            // Remaining: 50, 40
            expect(heap.pop()?.relaxedEvaluation).toBe(40);
            expect(heap.pop()?.relaxedEvaluation).toBe(50);
            expect(heap.isEmpty()).toBe(true);
        });

        it("handles negative relaxed evaluations correctly", () => {
            heap.push(createBranch(-10));
            heap.push(createBranch(-30));
            heap.push(createBranch(-20));
            heap.push(createBranch(0));

            expect(heap.pop()?.relaxedEvaluation).toBe(-30);
            expect(heap.pop()?.relaxedEvaluation).toBe(-20);
            expect(heap.pop()?.relaxedEvaluation).toBe(-10);
            expect(heap.pop()?.relaxedEvaluation).toBe(0);
        });

        it("handles floating point relaxed evaluations", () => {
            heap.push(createBranch(1.5));
            heap.push(createBranch(1.1));
            heap.push(createBranch(1.3));

            expect(heap.pop()?.relaxedEvaluation).toBe(1.1);
            expect(heap.pop()?.relaxedEvaluation).toBe(1.3);
            expect(heap.pop()?.relaxedEvaluation).toBe(1.5);
        });
    });

    describe("branch with cuts", () => {
        it("preserves cuts when pushing and popping", () => {
            const branch: Branch = {
                relaxedEvaluation: 10,
                cuts: [
                    { type: "min", varIndex: 0, value: 5 },
                    { type: "max", varIndex: 1, value: 10 },
                ],
            };

            heap.push(branch);
            const popped = heap.pop();

            expect(popped).toBe(branch);
            expect(popped?.cuts).toHaveLength(2);
            expect(popped?.cuts[0]).toEqual({ type: "min", varIndex: 0, value: 5 });
            expect(popped?.cuts[1]).toEqual({ type: "max", varIndex: 1, value: 10 });
        });
    });
});
