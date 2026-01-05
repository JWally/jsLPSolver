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

        const compilerOptions = (() => {
            const baseOptions = {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2019,
                esModuleInterop: true,
            };

            const tsconfigPath = ts.findConfigFile(
                process.cwd(),
                ts.sys.fileExists,
                "tsconfig.json"
            );
            if (!tsconfigPath) {
                return baseOptions;
            }

            const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
            if (configFile.error) {
                return baseOptions;
            }

            const parsedConfig = ts.parseJsonConfigFileContent(
                configFile.config,
                ts.sys,
                path.dirname(tsconfigPath)
            );

            return {
                ...baseOptions,
                module: parsedConfig.options.module ?? baseOptions.module,
                target: parsedConfig.options.target ?? baseOptions.target,
                esModuleInterop:
                    parsedConfig.options.esModuleInterop ?? baseOptions.esModuleInterop,
            };
        })();

        require.extensions[".ts"] = function compile(module, filename) {
            const source = fs.readFileSync(filename, "utf8");
            const { outputText } = ts.transpileModule(source, {
                compilerOptions,
                fileName: filename,
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
