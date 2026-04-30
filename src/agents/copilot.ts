import type { AgentAdapter } from "../types";
import { createSubprocessAdapter } from "./base";

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
    if (options.allowAllTools !== false) args.push("--allow-all-tools");
    if (options.allowAllPaths !== false) args.push("--allow-all-paths");
    const fmt =
      typeof options.outputFormat === "string" ? options.outputFormat : "json";
    args.push("--output-format", fmt);
    const configDir =
      typeof options.configDir === "string"
        ? options.configDir.replace("{workspacePath}", workspacePath)
        : workspacePath;
    args.push("--config-dir", configDir);
    return args;
  },
);

export default copilotAdapter;
