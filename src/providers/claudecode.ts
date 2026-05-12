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

function parseClaudeCodeJsonTokenUsage(stdout: string): TokenUsage | null {
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;

    try {
      const event = JSON.parse(trimmed) as {
        type?: string;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
        };
      };

      if (event.type !== "result" || !event.usage) continue;

      const inputTokens =
        typeof event.usage.input_tokens === "number"
          ? event.usage.input_tokens
          : null;
      const outputTokens =
        typeof event.usage.output_tokens === "number"
          ? event.usage.output_tokens
          : null;

      if (inputTokens !== null || outputTokens !== null) {
        return { inputTokens, outputTokens };
      }
    } catch {
      // skip malformed lines
    }
  }

  return null;
}

const claudecodeProvider: CLIProvider = {
  name: "claudecode",
  command: "claude",
  defaultAgentArgs: ["-p", "{requirementsContent}", "--output-format", "json"],
  buildAgentOptionArgs(options, _workspacePath, agentConfig) {
    const args: string[] = [];

    if (typeof agentConfig.model === "string")
      args.push("--model", agentConfig.model);

    if (typeof options.systemPrompt === "string")
      args.push("--system-prompt", options.systemPrompt);
    if (typeof options.appendSystemPrompt === "string")
      args.push("--append-system-prompt", options.appendSystemPrompt);

    if (typeof options.maxTurns === "number")
      args.push("--max-turns", String(options.maxTurns));

    if (options.continue === true) args.push("--continue");
    if (typeof options.resume === "string")
      args.push("--resume", options.resume);
    if (options.verbose === true) args.push("--verbose");

    pushRepeatableFlag(args, "--add-dir", options.addDir);
    pushRepeatableFlag(args, "--allowedTools", options.allowedTools);
    pushRepeatableFlag(args, "--disallowedTools", options.disallowedTools);

    if (options.dangerouslySkipPermissions !== false)
      args.push("--dangerously-skip-permissions");

    return args;
  },
  buildJudgeArgs(prompt, model) {
    const args = ["-p", prompt, "--output-format", "json"];
    if (model) args.push("--model", model);
    return args;
  },
  extractJudgeContent(stdout) {
    for (const line of stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) continue;

      try {
        const event = JSON.parse(trimmed) as {
          type?: string;
          result?: string;
          is_error?: boolean;
        };

        if (event.type === "result" && !event.is_error) {
          if (typeof event.result === "string" && event.result.length > 0) {
            return event.result;
          }
        }
      } catch {
        // skip malformed lines
      }
    }

    throw new Error(
      "claude CLI judge: could not extract result from output",
    );
  },
  extractTokenUsage(stdout) {
    return parseClaudeCodeJsonTokenUsage(stdout);
  },
};

export default claudecodeProvider;
