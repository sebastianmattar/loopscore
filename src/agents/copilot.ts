import copilotProvider from "../providers/copilot.js";
import type { AgentAdapter } from "../types.js";
import { createProviderAdapter } from "./base.js";

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
const copilotAdapter: AgentAdapter = createProviderAdapter(copilotProvider);

export default copilotAdapter;
