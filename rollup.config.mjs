import path from "node:path";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";

import alias from "@rollup/plugin-alias";
import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const extensions = [".ts", ".js"];
const baseExternal = [
    ...builtinModules,
    ...builtinModules.map((moduleName) => `node:${moduleName}`),
];

const createTsPlugin = () =>
    typescript({
        tsconfig: "./tsconfig.build.json",
        compilerOptions: {
            declaration: false,
            declarationDir: undefined,
        },
    });

const createAliases = (useShim = false) =>
    alias({
        entries: useShim
            ? [
                  {
                      find: "./external/main",
                      replacement: path.resolve(__dirname, "src/shims/external.ts"),
                  },
              ]
            : [],
    });

export default [
    {
        input: "src/solver.ts",
        output: [
            {
                file: "dist/index.cjs",
                format: "cjs",
                sourcemap: true,
                exports: "auto",
            },
            {
                file: "dist/index.mjs",
                format: "esm",
                sourcemap: true,
            },
        ],
        treeshake: {
            preset: "recommended",
        },
        external: baseExternal,
        plugins: [createAliases(), nodeResolve({ extensions }), commonjs(), createTsPlugin()],
    },
    {
        input: "src/solver.ts",
        output: [
            {
                file: "dist/index.browser.mjs",
                format: "esm",
                sourcemap: true,
            },
            {
                file: "dist/solver.global.js",
                format: "iife",
                sourcemap: true,
                name: "solver",
            },
        ],
        treeshake: {
            preset: "recommended",
        },
        plugins: [
            createAliases(true),
            nodeResolve({ extensions, browser: true, preferBuiltins: false }),
            commonjs(),
            createTsPlugin(),
        ],
    },
    {
        input: "dist/types/solver.d.ts",
        output: {
            file: "dist/index.d.ts",
            format: "es",
        },
        plugins: [
            dts({
                tsconfig: "./tsconfig.build.json",
            }),
        ],
    },
];
