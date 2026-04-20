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
      return spawnAgent(
        agentConfig.cmd,
        variant.args ?? defaultArgs,
        workspacePath,
      );
    },
  };
}
