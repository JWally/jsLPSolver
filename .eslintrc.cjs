module.exports = {
    root: true,
    env: {
        es2020: true,
        node: true,
    },
    parser: "@typescript-eslint/parser",
    parserOptions: {
        sourceType: "module",
        ecmaVersion: 2020,
    },
    plugins: ["@typescript-eslint", "unicorn"],
    ignorePatterns: ["dist/", "node_modules/", "prod/"],
    overrides: [
        {
            files: ["src/**/*.{ts,js}", "test/**/*.{ts,js}", "scripts/**/*.{ts,js}", "types/**/*.{ts,js}"],
            rules: {
                "unicorn/filename-case": ["error", { case: "kebabCase" }],
                "no-restricted-syntax": [
                    "error",
                    {
                        selector: "MemberExpression[property.name='prototype']",
                        message: "Prototype mutation is forbidden; use instance composition instead.",
                    },
                ],
            },
        },
    ],
};
