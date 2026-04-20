import type { AgentAdapter, AgentConfig } from "../types";
import { createSubprocessAdapter } from "./base";

/**
 * Gemini CLI agent adapter.
 *
 * Default invocation (configurable via bench.config.json):
 *   gemini -p "{requirementsContent}" --yolo
 *
 * -p / --prompt  runs in non-interactive (headless) mode.
 * --yolo         auto-approves all tool actions.
 *
 * Requires: `gemini` CLI installed and `GEMINI_API_KEY` or `GOOGLE_API_KEY` set.
 */
const base = createSubprocessAdapter("gemini", [
  "-p",
  "{requirementsContent}",
  "--yolo",
]);

const geminiAdapter: AgentAdapter = {
  ...base,
  async healthcheck(config: AgentConfig): Promise<void> {
    await base.healthcheck(config);
    if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
      throw new Error(
        `Agent "gemini" healthcheck failed: neither GEMINI_API_KEY nor GOOGLE_API_KEY is set.`,
      );
    }
  },
};

export default geminiAdapter;
