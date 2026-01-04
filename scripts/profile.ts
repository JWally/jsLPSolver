import fs from "fs";
import path from "path";
import solver from "../src/solver";
import type { TestModel } from "../test/types";

const SUITE_PATH = path.join(__dirname, "..", "test", "test-sanity");

interface ProfileResult {
    name: string;
    timeNs: bigint;
    timeMs: number;
    feasible: boolean;
}

function formatTime(ns: bigint): string {
    const ms = Number(ns) / 1_000_000;
    if (ms < 1) {
        return `${(Number(ns) / 1000).toFixed(2)} µs`;
    }
    if (ms < 1000) {
        return `${ms.toFixed(3)} ms`;
    }
    return `${(ms / 1000).toFixed(3)} s`;
}

function padRight(str: string, len: number): string {
    return str.length >= len ? str : str + " ".repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
    return str.length >= len ? str : " ".repeat(len - str.length) + str;
}

function main(): void {
    const jsonFiles = fs
        .readdirSync(SUITE_PATH)
        .filter((file) => /\.json$/.test(file))
        .sort();

    const problems: TestModel[] = jsonFiles.map((fileName) => {
        const rawModel = fs.readFileSync(path.join(SUITE_PATH, fileName), "utf8");
        return JSON.parse(rawModel) as TestModel;
    });

    const results: ProfileResult[] = [];
    let totalNs = BigInt(0);

    console.log(`\nProfiling ${problems.length} problems from test-sanity...\n`);

    for (const problem of problems) {
        // Warm-up run (JIT optimization)
        try {
            solver.Solve(problem);
        } catch {
            // ignore warm-up errors
        }

        // Timed run
        const start = process.hrtime.bigint();
        let feasible = false;
        try {
            const result = solver.Solve(problem) as { feasible: boolean };
            feasible = result.feasible;
        } catch {
            feasible = false;
        }
        const end = process.hrtime.bigint();

        const timeNs = end - start;
        totalNs += timeNs;

        results.push({
            name: problem.name,
            timeNs,
            timeMs: Number(timeNs) / 1_000_000,
            feasible,
        });
    }

    // Sort by time descending
    const sorted = [...results].sort((a, b) => Number(b.timeNs - a.timeNs));

    // Find max name length for formatting
    const maxNameLen = Math.min(50, Math.max(...results.map((r) => r.name.length)));

    // Print results
    console.log("─".repeat(maxNameLen + 25));
    console.log(`${padRight("Problem", maxNameLen)}  ${padLeft("Time", 12)}  Status`);
    console.log("─".repeat(maxNameLen + 25));

    for (const result of sorted) {
        const name =
            result.name.length > maxNameLen
                ? result.name.substring(0, maxNameLen - 3) + "..."
                : result.name;
        const status = result.feasible ? "✓" : "✗";
        console.log(
            `${padRight(name, maxNameLen)}  ${padLeft(formatTime(result.timeNs), 12)}  ${status}`
        );
    }

    console.log("─".repeat(maxNameLen + 25));
    console.log(`${padRight("TOTAL", maxNameLen)}  ${padLeft(formatTime(totalNs), 12)}`);
    console.log(
        `${padRight("AVERAGE", maxNameLen)}  ${padLeft(formatTime(totalNs / BigInt(results.length)), 12)}`
    );
    console.log();

    // Stats summary
    const times = results.map((r) => r.timeMs);
    const min = Math.min(...times);
    const max = Math.max(...times);
    const median = times.sort((a, b) => a - b)[Math.floor(times.length / 2)];

    console.log("Statistics:");
    console.log(`  Fastest: ${min.toFixed(3)} ms`);
    console.log(`  Slowest: ${max.toFixed(3)} ms`);
    console.log(`  Median:  ${median.toFixed(3)} ms`);
    console.log();
}

main();
