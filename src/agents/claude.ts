import type { AgentAdapter } from "../types.js";
import { createSubprocessAdapter } from "./base.js";

/**
 * Anthropic Claude Code CLI agent adapter.
 *
 * Default invocation (configurable via bench.config.json):
 *   claude -p "{requirementsContent}" --allowedTools all
 *
 * -p / --print    runs in non-interactive (headless) mode.
 * --allowedTools  permits the agent to use all available tools.
 *
 * Requires: `claude` CLI installed and authenticated (`claude auth login`).
 */
const claudeAdapter: AgentAdapter = createSubprocessAdapter("claude", [
  "-p",
  "{requirementsContent}",
  "--allowedTools",
  "all",
]);

export default claudeAdapter;
