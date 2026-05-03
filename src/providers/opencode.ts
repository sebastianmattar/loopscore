import type { TokenUsage } from "../types.js";
import type { CLIProvider } from "./base.js";

function pushRepeatableFlag(
  args: string[],
  flag: string,
  values: unknown,
): void {
  if (!Array.isArray(values)) return;
  for (const value of values) {
    if (typeof value !== "string") continue;
    args.push(flag, value);
  }
}

function parseOpencodeJsonTokenUsage(stdout: string): TokenUsage | null {
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;

    try {
      const event = JSON.parse(trimmed) as {
        type?: string;
        part?: {
          tokens?: {
            input?: number;
            output?: number;
          };
        };
      };

      if (event.type !== "step_finish") continue;

      const tokens = event.part?.tokens;
      if (!tokens) continue;

      const inputTokens =
        typeof tokens.input === "number" ? tokens.input : null;
      const outputTokens =
        typeof tokens.output === "number" ? tokens.output : null;

      if (inputTokens !== null || outputTokens !== null) {
        return { inputTokens, outputTokens };
      }
    } catch {
      // skip malformed lines
    }
  }

  return null;
}

const opencodeProvider: CLIProvider = {
  name: "opencode",
  command: "opencode",
  defaultAgentArgs: ["run", "{requirementsContent}", "--format", "json"],
  buildAgentOptionArgs(options, workspacePath, agentConfig) {
    const args: string[] = [];

    if (typeof agentConfig.model === "string")
      args.push("--model", agentConfig.model);
    if (typeof options.agent === "string") args.push("--agent", options.agent);
    if (options.continue === true) args.push("--continue");
    if (typeof options.session === "string")
      args.push("--session", options.session);
    if (options.fork === true) args.push("--fork");
    if (options.share === true) args.push("--share");
    pushRepeatableFlag(args, "--file", options.file);
    if (typeof options.title === "string") args.push("--title", options.title);
    if (typeof options.attach === "string")
      args.push("--attach", options.attach);
    if (typeof options.password === "string")
      args.push("--password", options.password);

    const dir = typeof options.dir === "string" ? options.dir : workspacePath;
    args.push("--dir", dir);

    if (typeof options.port === "number")
      args.push("--port", String(options.port));
    if (typeof options.variant === "string")
      args.push("--variant", options.variant);
    if (options.thinking === true) args.push("--thinking");
    if (options.dangerouslySkipPermissions !== false) {
      args.push("--dangerously-skip-permissions");
    }
    if (typeof options.command === "string")
      args.push("--command", options.command);
    if (options.pure === true) args.push("--pure");
    if (typeof options.logLevel === "string")
      args.push("--log-level", options.logLevel);
    if (options.printLogs === true) args.push("--print-logs");

    return args;
  },
  buildJudgeArgs(prompt, model) {
    const args = ["run", prompt, "--format", "json"];
    if (model) args.push("--model", model);
    return args;
  },
  extractJudgeContent(stdout) {
    const parts: string[] = [];

    for (const line of stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) continue;

      try {
        const event = JSON.parse(trimmed) as {
          type?: string;
          part?: { text?: string };
        };
        if (event.type === "text" && typeof event.part?.text === "string") {
          parts.push(event.part.text);
        }
      } catch {
        // skip malformed lines
      }
    }

    const content = parts.join("").trim();
    if (!content) {
      throw new Error(
        "opencode CLI judge: could not extract text response from output",
      );
    }

    return content;
  },
  extractTokenUsage(stdout) {
    return parseOpencodeJsonTokenUsage(stdout);
  },
};

export default opencodeProvider;
