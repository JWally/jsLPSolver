/**
 * @file src/shims/external.ts
 * @description Browser shim for external solver module
 *
 * In browser environments, external solvers (which require Node.js
 * child_process and fs) are not available. This shim provides an
 * empty export to satisfy imports without runtime errors.
 */
import type { ExternalSolvers } from "../external/main";

const External: ExternalSolvers = {};

export default External;
