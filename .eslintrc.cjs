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
    extends: ["eslint:recommended", "prettier"],
    ignorePatterns: ["dist/", "node_modules/", "prod/", "docs/"],
    rules: {
        // Allow unused vars with underscore prefix
        "no-unused-vars": "off",
        "@typescript-eslint/no-unused-vars": [
            "warn",
            {
                argsIgnorePattern: "^_",
                varsIgnorePattern: "^_",
                caughtErrorsIgnorePattern: "^_",
            },
        ],
        // Consistency
        eqeqeq: ["error", "always", { null: "ignore" }],
        "no-var": "error",
        "prefer-const": "warn",
        // No console in production code (warn, not error)
        "no-console": "warn",
    },
    overrides: [
        {
            files: [
                "src/**/*.{ts,js}",
                "test/**/*.{ts,js}",
                "scripts/**/*.{ts,js}",
                "types/**/*.{ts,js}",
            ],
            rules: {
                "unicorn/filename-case": ["error", { case: "kebabCase" }],
                "no-restricted-syntax": [
                    "error",
                    {
                        selector: "MemberExpression[property.name='prototype']",
                        message:
                            "Prototype mutation is forbidden; use instance composition instead.",
                    },
                ],
            },
        },
        {
            // Allow console in scripts and tests
            files: ["scripts/**/*.{ts,js}", "test/**/*.{ts,js}"],
            env: {
                mocha: true,
            },
            rules: {
                "no-console": "off",
                "no-restricted-syntax": "off",
            },
        },
        {
            // Legacy JS files - relax rules
            files: ["src/external/**/*.js"],
            rules: {
                "no-var": "off",
                "no-redeclare": "off",
                "no-useless-escape": "off",
                "@typescript-eslint/no-unused-vars": "off",
                "no-console": "off",
            },
        },
    ],
};
