import claudecodeProvider from "../providers/claudecode.js";
import type { AgentAdapter } from "../types.js";
import { createProviderAdapter } from "./base.js";

/**
 * Claude Code CLI agent adapter.
 *
 * Default invocation:
 *   claude -p "{requirementsContent}" --output-format json
 *
 * The adapter defaults to --dangerously-skip-permissions for unattended runs.
 */
const claudecodeAdapter: AgentAdapter = createProviderAdapter(claudecodeProvider);

export default claudecodeAdapter;
