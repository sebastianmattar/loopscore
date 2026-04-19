import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { spawnAgent } from "../runner/subprocess.js";
import type {
  AgentAdapter,
  AgentConfig,
  AgentInvokeResult,
  Task,
} from "../types.js";

/**
 * Substitutes template variables in args:
 *   {requirementsFile}    – absolute path to requirements.md
 *   {requirementsContent} – full text content of requirements.md
 *   {workspacePath}       – absolute workspace dir
 *   {prompt}              – task prompt text
 */
function resolveArgs(
  args: string[],
  workspacePath: string,
  task: Task,
): string[] {
  const requirementsFile = path.join(workspacePath, "requirements.md");
  const requirementsContent = fs.existsSync(requirementsFile)
    ? fs.readFileSync(requirementsFile, "utf-8")
    : task.prompt;
  return args.map((arg) =>
    arg
      .replace(/{requirementsFile}/g, requirementsFile)
      .replace(/{requirementsContent}/g, requirementsContent)
      .replace(/{workspacePath}/g, workspacePath)
      .replace(/{prompt}/g, task.prompt),
  );
}

/**
 * Generic subprocess-based adapter. Works for any agent whose invocation
 * is fully described by `cmd` + `args` in the AgentConfig.
 * Concrete adapters re-use this with sensible default args.
 */
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
      task: Task,
      config: AgentConfig,
    ): Promise<AgentInvokeResult> {
      const argsTemplate = config.args ?? defaultArgs;
      const resolvedArgs = resolveArgs(argsTemplate, workspacePath, task);

      return spawnAgent(config.cmd, resolvedArgs, workspacePath);
    },
  };
}
