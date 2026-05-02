import geminiProvider from "../providers/gemini.js";
import type { AgentAdapter } from "../types.js";
import { createProviderAdapter } from "./base.js";

/**
 * Gemini CLI agent adapter.
 *
 * Default invocation (configurable via bench.config.json):
 *   gemini -p "{requirementsContent}" [--yolo] [additional options]
 *
 * -p / --prompt  runs in non-interactive (headless) mode.
 * --yolo         auto-approves all tool actions (default: true).
 *
 * Options can be overridden via the `agent.options` field in bench config.
 * Requires: `gemini` CLI installed and `GEMINI_API_KEY` or `GOOGLE_API_KEY` set.
 */
const geminiAdapter: AgentAdapter = createProviderAdapter(geminiProvider);

export default geminiAdapter;
