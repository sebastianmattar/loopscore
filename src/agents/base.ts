import { execFileSync } from "child_process";
import { spawnAgent } from "../runner/subprocess";
import type {
  AgentAdapter,
  AgentConfig,
  AgentInvokeResult,
  VariantConfig,
} from "../types";

export function createSubprocessAdapter(
  adapterName: string,
  defaultConfig: AgentConfig,
): AgentAdapter {
  return {
    name: adapterName,

    getVersion(agentConfig: AgentConfig): string {
      const resolvedConfig = { ...defaultConfig, ...agentConfig };
      try {
        return (
          execFileSync(resolvedConfig.cmd!, ["--version"], {
            timeout: 5000,
            encoding: "utf-8",
          })
            .trim()
            .split("\n")[0] ?? "unknown"
        );
      } catch {
        return "unknown";
      }
    },

    async healthcheck(agentConfig: AgentConfig): Promise<void> {
      const resolvedConfig = { ...defaultConfig, ...agentConfig };
      try {
        execFileSync(resolvedConfig.cmd!, ["--version"], {
          stdio: "ignore",
          timeout: 8000,
        });
      } catch {
        throw new Error(
          `Agent "${resolvedConfig.type}" healthcheck failed: command "${resolvedConfig.cmd}" not found or returned an error. ` +
            `Make sure it is installed and available in PATH.`,
        );
      }
    },

    async invoke(
      workspacePath: string,
      variant: VariantConfig,
    ): Promise<AgentInvokeResult> {
      const resolvedAgent = { ...defaultConfig, ...variant.agent };
      const requirementsContent = variant.query?.join("\n") ?? "";
      const rawArgs = resolvedAgent.args ?? [];
      const resolvedArgs = rawArgs.map((arg) =>
        arg
          .replace("{requirementsContent}", requirementsContent)
          .replace("{workspacePath}", workspacePath),
      );
      return spawnAgent(resolvedAgent.cmd!, resolvedArgs, workspacePath);
    },
  };
}
