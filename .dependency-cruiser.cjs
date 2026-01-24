/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
    forbidden: [
        {
            name: "no-circular",
            severity: "error",
            comment: "Circular dependencies make code hard to follow and refactor.",
            from: {},
            to: {
                circular: true,
                viaOnly: { dependencyTypesNot: ["type-only", "type-import"] },
            },
        },
        {
            name: "no-orphans",
            severity: "warn",
            comment: "Unused files that are not imported anywhere.",
            from: { orphan: true, pathNot: ["\\.test\\.ts$", "\\.d\\.ts$", "index\\.ts$"] },
            to: {},
        },
    ],
    options: {
        doNotFollow: { path: ["node_modules", "dist", "coverage"] },
        tsPreCompilationDeps: true,
        tsConfig: { fileName: "tsconfig.json" },
        exclude: ["(^|/)\\.[^/]+"],
        reporterOptions: {
            text: { highlightFocused: true },
        },
    },
};
