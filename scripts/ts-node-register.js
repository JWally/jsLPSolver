try {
    // Prefer ts-node when available to align tests with the TypeScript config.
    require("ts-node/register/transpile-only");
} catch (error) {
    if (error && error.code !== "MODULE_NOT_FOUND") {
        throw error;
    }
    // Keep tests running even when ts-node is not installed in restricted environments.
    // eslint-disable-next-line no-console
    console.warn("ts-node is not installed; proceeding without TypeScript runtime hooks.");
}
