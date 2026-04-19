import type { AgentAdapter } from "../types";
import { createSubprocessAdapter } from "./base";

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
