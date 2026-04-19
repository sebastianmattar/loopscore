import type { AgentAdapter } from "../types.js";
import { createSubprocessAdapter } from "./base.js";

/**
 * Kiro agent adapter.
 *
 * Default invocation (configurable via bench.config.json):
 *   kiro --task {requirementsFile} --yes
 *
 * Requires: `kiro` CLI installed.
 */
const kiroAdapter: AgentAdapter = createSubprocessAdapter("kiro", [
  "--task",
  "{requirementsFile}",
  "--yes",
]);

export default kiroAdapter;
