import type { AgentAdapter } from "../types.js";
import { createSubprocessAdapter } from "./base.js";

/**
 * GitHub Copilot agent adapter.
 *
 * Default invocation (configurable via bench.config.json):
 *   copilot -p "{requirementsContent}" --allow-all-tools --allow-all-paths --output-format json
 *
 * --allow-all-tools  is required for non-interactive (headless) mode.
 * --allow-all-paths  allows writing anywhere in the workspace without prompts.
 * --output-format json  emits JSONL progress events to stdout for metrics.
 *
 * Requires: `copilot` CLI installed and authenticated.
 */
const copilotAdapter: AgentAdapter = createSubprocessAdapter("gh-copilot", [
  "-p",
  "{requirementsContent}",
  "--allow-all-tools",
  "--allow-all-paths",
  "--output-format",
  "json",
]);

export default copilotAdapter;
