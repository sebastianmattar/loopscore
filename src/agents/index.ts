import type { AgentAdapter } from "../types";
import copilotAdapter from "./copilot";
import geminiAdapter from "./gemini";

/**
 * Built-in adapters. Keys match the `name` field in AgentConfig.
 * To add a new agent, create a new file in src/agents/ and register it here.
 */
const BUILT_IN_ADAPTERS: Record<string, AgentAdapter> = {
  copilot: copilotAdapter,
  gemini: geminiAdapter,
};

/**
 * Returns the adapter for the given agent config.
 * Falls back to a generic subprocess adapter if no named adapter is registered,
 * allowing arbitrary CLI agents to be used via bench.config.json alone.
 */
export function getAdapter(agentType: string): AgentAdapter {
  const adapter = BUILT_IN_ADAPTERS[agentType];
  if (!adapter) {
    throw new Error("Could not find agent adapter for " + agentType + ".");
  }
  return adapter;
}

export function listAdapterNames(): string[] {
  return Object.keys(BUILT_IN_ADAPTERS);
}
