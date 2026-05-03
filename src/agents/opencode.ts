import opencodeProvider from "../providers/opencode.js";
import type { AgentAdapter } from "../types.js";
import { createProviderAdapter } from "./base.js";

/**
 * OpenCode CLI agent adapter.
 *
 * Default invocation:
 *   opencode run "{requirementsContent}" --format json --dir {workspacePath}
 *
 * The adapter defaults to --dangerously-skip-permissions for unattended runs.
 */
const opencodeAdapter: AgentAdapter = createProviderAdapter(opencodeProvider);

export default opencodeAdapter;
