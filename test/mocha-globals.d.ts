interface MochaContext {
    timeout(ms: number): void;
}

declare function describe(title: string, fn: (this: MochaContext) => void): void;
declare function it(title: string, fn?: (this: MochaContext) => void): void;
