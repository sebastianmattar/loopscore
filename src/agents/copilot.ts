import type { AgentAdapter } from "../types";
import { createSubprocessAdapter } from "./base";

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

function pushRepeatableEqualsFlag(
  args: string[],
  flag: string,
  values: unknown,
): void {
  if (!Array.isArray(values)) return;
  for (const value of values) {
    if (typeof value !== "string") continue;
    args.push(`${flag}=${value}`);
  }
}

/**
 * GitHub Copilot agent adapter.
 *
 * Default invocation (configurable via bench.config.json):
 *   copilot -p "{requirementsContent}" [--allow-all-tools] [--allow-all-paths]
 *           [--output-format json] [--config-dir {workspacePath}]
 *
 * Options can be overridden via the `agent.options` field in bench config.
 * Requires: `copilot` CLI installed and authenticated.
 */
const copilotAdapter: AgentAdapter = createSubprocessAdapter(
  "copilot",
  {
    type: "copilot",
    cmd: "copilot",
    args: ["-p", "{requirementsContent}"],
  },
  (options, workspacePath) => {
    const args: string[] = [];

    const reasoningEffort =
      typeof options.reasoningEffort === "string"
        ? options.reasoningEffort
        : typeof options.effort === "string"
          ? options.effort
          : undefined;
    if (reasoningEffort) args.push("--reasoning-effort", reasoningEffort);

    if (typeof options.agent === "string") args.push("--agent", options.agent);

    pushRepeatableFlag(args, "--add-dir", options.addDir);
    pushRepeatableFlag(args, "--add-github-mcp-tool", options.addGithubMcpTool);
    pushRepeatableFlag(
      args,
      "--add-github-mcp-toolset",
      options.addGithubMcpToolset,
    );
    pushRepeatableFlag(
      args,
      "--additional-mcp-config",
      options.additionalMcpConfig,
    );

    if (options.allowAll === true) args.push("--allow-all");
    if (options.allowAllTools !== false) args.push("--allow-all-tools");
    if (options.allowAllPaths !== false) args.push("--allow-all-paths");
    if (options.allowAllUrls === true) args.push("--allow-all-urls");
    pushRepeatableEqualsFlag(args, "--allow-tool", options.allowTool);
    pushRepeatableEqualsFlag(args, "--allow-url", options.allowUrl);

    if (options.autopilot === true) args.push("--autopilot");
    pushRepeatableEqualsFlag(args, "--available-tools", options.availableTools);
    if (options.banner === true) args.push("--banner");

    if (options.bashEnv === true) args.push("--bash-env");
    if (typeof options.bashEnv === "string") {
      args.push(`--bash-env=${options.bashEnv}`);
    }
    if (options.noBashEnv === true) args.push("--no-bash-env");

    pushRepeatableEqualsFlag(args, "--deny-tool", options.denyTool);
    pushRepeatableEqualsFlag(args, "--deny-url", options.denyUrl);
    if (options.disableBuiltinMcps === true)
      args.push("--disable-builtin-mcps");
    pushRepeatableFlag(args, "--disable-mcp-server", options.disableMcpServer);
    if (options.disallowTempDir === true) args.push("--disallow-temp-dir");
    if (options.enableAllGithubMcpTools === true) {
      args.push("--enable-all-github-mcp-tools");
    }
    if (options.enableReasoningSummaries === true) {
      args.push("--enable-reasoning-summaries");
    }
    pushRepeatableEqualsFlag(args, "--excluded-tools", options.excludedTools);

    if (options.experimental === true) args.push("--experimental");
    if (options.experimental === false) args.push("--no-experimental");

    const fmt =
      typeof options.outputFormat === "string" ? options.outputFormat : "json";
    args.push("--output-format", fmt);

    if (typeof options.logDir === "string") {
      args.push("--log-dir", options.logDir);
    }
    if (typeof options.logLevel === "string") {
      args.push("--log-level", options.logLevel);
    }
    if (typeof options.maxAutopilotContinues === "number") {
      args.push(
        "--max-autopilot-continues",
        String(options.maxAutopilotContinues),
      );
    }
    if (typeof options.mode === "string") args.push("--mode", options.mode);

    if (options.mouse === true) args.push("--mouse");
    if (typeof options.mouse === "string")
      args.push(`--mouse=${options.mouse}`);
    if (options.noMouse === true) args.push("--no-mouse");

    if (options.noAskUser === true) args.push("--no-ask-user");
    if (options.noAutoUpdate === true) args.push("--no-auto-update");
    if (options.noColor === true) args.push("--no-color");
    if (options.noCustomInstructions === true) {
      args.push("--no-custom-instructions");
    }
    if (options.noRemote === true) args.push("--no-remote");

    if (options.plainDiff === true) args.push("--plain-diff");
    pushRepeatableFlag(args, "--plugin-dir", options.pluginDir);
    if (options.remote === true) args.push("--remote");

    if (options.resume === true) args.push("--resume");
    if (typeof options.resume === "string")
      args.push(`--resume=${options.resume}`);
    if (options.connect === true) args.push("--connect");
    if (typeof options.connect === "string") {
      args.push(`--connect=${options.connect}`);
    }
    if (options.continue === true) args.push("--continue");
    if (options.plan === true) args.push("--plan");
    if (options.silent === true) args.push("--silent");
    if (options.screenReader === true) args.push("--screen-reader");

    pushRepeatableEqualsFlag(args, "--secret-env-vars", options.secretEnvVars);

    if (options.share === true) args.push("--share");
    if (typeof options.share === "string") {
      args.push(`--share=${options.share}`);
    }
    if (options.shareGist === true) args.push("--share-gist");
    if (typeof options.stream === "string")
      args.push("--stream", options.stream);

    if (options.yolo === true) args.push("--yolo");

    const configDir =
      typeof options.configDir === "string" ? options.configDir : workspacePath;
    args.push("--config-dir", configDir);
    return args.map((arg) => arg.replace("{workspacePath}", workspacePath));
  },
);

export default copilotAdapter;
