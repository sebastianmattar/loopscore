import type { AgentAdapter, AgentConfig } from "../types";
import { createSubprocessAdapter } from "./base";

function pushRepeatableFlag(args: string[], flag: string, values: unknown): void {
  if (!Array.isArray(values)) return;
  for (const value of values) {
    if (typeof value !== "string") continue;
    args.push(flag, value);
  }
}

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
const base = createSubprocessAdapter(
  "gemini",
  {
    type: "gemini",
    cmd: "gemini",
    args: ["-p", "{requirementsContent}"],
  },
  (options, workspacePath) => {
    const args: string[] = [];

    if (options.debug === true) args.push("--debug");
    if (typeof options.model === "string") args.push("--model", options.model);

    if (options.worktree === true) args.push("--worktree");
    if (typeof options.worktree === "string") {
      args.push("--worktree", options.worktree);
    }

    if (options.sandbox === true) args.push("--sandbox");

    if (options.yolo !== false) args.push("--yolo");

    if (typeof options.approvalMode === "string") {
      args.push("--approval-mode", options.approvalMode);
    }

    pushRepeatableFlag(args, "--policy", options.policy);
    pushRepeatableFlag(args, "--admin-policy", options.adminPolicy);

    if (options.acp === true) args.push("--acp");
    if (options.experimentalAcp === true) args.push("--experimental-acp");

    pushRepeatableFlag(
      args,
      "--allowed-mcp-server-names",
      options.allowedMcpServerNames,
    );
    pushRepeatableFlag(args, "--allowed-tools", options.allowedTools);
    pushRepeatableFlag(args, "--extensions", options.extensions);

    if (typeof options.resume === "string") args.push("--resume", options.resume);

    pushRepeatableFlag(
      args,
      "--include-directories",
      options.includeDirectories,
    );

    if (options.screenReader === true) args.push("--screen-reader");
    if (typeof options.outputFormat === "string") {
      args.push("--output-format", options.outputFormat);
    }
    if (options.rawOutput === true) args.push("--raw-output");
    if (options.acceptRawOutputRisk === true) {
      args.push("--accept-raw-output-risk");
    }

    return args.map((arg) => arg.replace("{workspacePath}", workspacePath));
  },
);

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
