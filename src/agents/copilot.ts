import type { AgentAdapter } from "../types";
import { createSubprocessAdapter } from "./base";

/**
 * GitHub Copilot agent adapter.
 *
 * Default invocation (configurable via bench.config.json):
 *   copilot agent --file {requirementsFile}
 *
 * Requires: `copilot` CLI installed.
 */
const copilotAdapter: AgentAdapter = createSubprocessAdapter("gh-copilot", [
  "agent",
  "--file",
  "{requirementsFile}",
]);

export default copilotAdapter;
