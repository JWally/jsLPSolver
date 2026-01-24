/**
 * Browser shim for external solvers.
 * External solvers require Node.js (child_process) and are unavailable in browsers.
 */
import type { ExternalSolvers } from "../external/main";

const External: ExternalSolvers = {};

export default External;
