import type { AgentAdapter, AgentConfig } from "../types";
import { createSubprocessAdapter } from "./base";
import claudeAdapter from "./claude";
import copilotAdapter from "./copilot";
import geminiAdapter from "./gemini";
import kiroAdapter from "./kiro";

/**
 * Built-in adapters. Keys match the `name` field in AgentConfig.
 * To add a new agent, create a new file in src/agents/ and register it here.
 */
const BUILT_IN_ADAPTERS: Record<string, AgentAdapter> = {
  copilot: copilotAdapter,
  kiro: kiroAdapter,
  gemini: geminiAdapter,
  claude: claudeAdapter,
};

/**
 * Returns the adapter for the given agent config.
 * Falls back to a generic subprocess adapter if no named adapter is registered,
 * allowing arbitrary CLI agents to be used via bench.config.json alone.
 */
export function getAdapter(config: AgentConfig): AgentAdapter {
  const adapter = BUILT_IN_ADAPTERS[config.name];
  if (adapter) {
    return adapter;
  }

  // Generic fallback: use cmd + args from config as-is
  if (!config.args) {
    throw new Error(
      `No built-in adapter found for agent "${config.name}" and no "args" defined in config. ` +
        `Either register a built-in adapter in src/agents/index.ts or add "args" to the agent config.`,
    );
  }

  return createSubprocessAdapter(config.name, config.args);
}

export function listAdapterNames(): string[] {
  return Object.keys(BUILT_IN_ADAPTERS);
}
