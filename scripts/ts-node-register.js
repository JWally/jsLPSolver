try {
    // Prefer ts-node when available to align tests with the TypeScript config.
    require("ts-node/register/transpile-only");
} catch (error) {
    if (error && error.code !== "MODULE_NOT_FOUND") {
        throw error;
    }
    // Keep tests running even when ts-node is not installed in restricted environments.
    try {
        const fs = require("fs");
        const path = require("path");

        let ts;
        try {
            ts = require("typescript");
        } catch (tsError) {
            const nvmTypescriptPath = path.join(
                path.dirname(process.execPath),
                "..",
                "lib",
                "node_modules",
                "typescript"
            );
            ts = require(nvmTypescriptPath);
        }

        require.extensions[".ts"] = function compile(module, filename) {
            const source = fs.readFileSync(filename, "utf8");
            const { outputText } = ts.transpileModule(source, {
                compilerOptions: {
                    module: ts.ModuleKind.CommonJS,
                    target: ts.ScriptTarget.ES2019,
                    esModuleInterop: true
                },
                fileName: filename
            });

            // eslint-disable-next-line no-underscore-dangle
            return module._compile(outputText, filename);
        };
    } catch (fallbackError) {
        // eslint-disable-next-line no-console
        console.warn("ts-node is not installed; proceeding without TypeScript runtime hooks.");
        // eslint-disable-next-line no-console
        console.warn(fallbackError);
    }
}
