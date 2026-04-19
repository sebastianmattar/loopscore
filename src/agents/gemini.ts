import type { AgentAdapter } from "../types.js";
import { createSubprocessAdapter } from "./base.js";

/**
 * Gemini CLI agent adapter.
 *
 * Default invocation (configurable via bench.config.json):
 *   gemini -p "{requirementsContent}" --yolo
 *
 * -p / --prompt  runs in non-interactive (headless) mode.
 * --yolo         auto-approves all tool actions.
 *
 * Requires: `gemini` CLI installed and authenticated (`gemini auth login`).
 */
const geminiAdapter: AgentAdapter = createSubprocessAdapter("gemini", [
  "-p",
  "{requirementsContent}",
  "--yolo",
]);

export default geminiAdapter;
