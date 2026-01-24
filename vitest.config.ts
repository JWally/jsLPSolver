import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        include: ["src/**/*.test.ts"],
        coverage: {
            provider: "v8",
            reporter: ["text", "html", "lcov"],
            include: ["src/**/*.ts"],
            exclude: [
                "src/**/*.test.ts",
                "src/types/**",
                "src/shims/**",
                "src/external/**",
                "src/tableau/index.ts",
            ],
            thresholds: {
                statements: 70,
                branches: 55,
                functions: 70,
                lines: 70,
            },
        },
    },
});
