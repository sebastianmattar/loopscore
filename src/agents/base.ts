import { execFileSync } from "child_process";
import { spawnAgent } from "../runner/subprocess";
import type {
  AgentAdapter,
  AgentConfig,
  AgentInvokeResult,
  VariantConfig,
} from "../types";

/**
 * Returns the first line of `cmd --version` output, or "unknown" on failure.
 */
export function getAgentVersion(config: AgentConfig): string {
  try {
    return (
      execFileSync(config.cmd, ["--version"], {
        timeout: 5000,
        encoding: "utf-8",
      })
        .trim()
        .split("\n")[0] ?? "unknown"
    );
  } catch {
    return "unknown";
  }
}

export function createSubprocessAdapter(
  adapterName: string,
  defaultArgs: string[],
): AgentAdapter {
  return {
    name: adapterName,

    async healthcheck(config: AgentConfig): Promise<void> {
      try {
        execFileSync(config.cmd, ["--version"], {
          stdio: "ignore",
          timeout: 8000,
        });
      } catch {
        throw new Error(
          `Agent "${config.name}" healthcheck failed: command "${config.cmd}" not found or returned an error. ` +
            `Make sure it is installed and available in PATH.`,
        );
      }
    },

    async invoke(
      workspacePath: string,
      variant: VariantConfig,
      agentConfig: AgentConfig,
    ): Promise<AgentInvokeResult> {
      const requirementsContent = variant.query?.join("\n") ?? "";
      const rawArgs = variant.args ?? defaultArgs;
      const resolvedArgs = rawArgs.map((arg) =>
        arg
          .replace("{requirementsContent}", requirementsContent)
          .replace("{workspacePath}", workspacePath),
      );
      return spawnAgent(agentConfig.cmd, resolvedArgs, workspacePath);
    },
  };
}
