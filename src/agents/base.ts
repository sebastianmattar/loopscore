import type { CLIProvider } from "../providers/base.js";
import {
  getProviderVersion,
  invokeProviderAgent,
  runProviderHealthcheck,
} from "../providers/base.js";
import type { AgentAdapter, AgentConfig, VariantConfig } from "../types.js";

export function createProviderAdapter(provider: CLIProvider): AgentAdapter {
  return {
    name: provider.name,

    getVersion(agentConfig: AgentConfig): string {
      return getProviderVersion(provider, agentConfig);
    },

    async healthcheck(agentConfig: AgentConfig): Promise<void> {
      await runProviderHealthcheck(provider, agentConfig);
    },

    async invoke(workspacePath: string, variant: VariantConfig) {
      return invokeProviderAgent(provider, workspacePath, variant);
    },
  };
}
