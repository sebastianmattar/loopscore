export type JudgeProvider = "claudecode" | "copilot" | "gemini" | "opencode";

// ── Agent ─────────────────────────────────────────────────────────────────────

export interface SetupConfig {
  files?: Record<string, string>;
  /** Shell commands to run in the workspace before/after the agent. */
  commands?: CommandsConfig;
}

/** Shell commands to run in the workspace before/after the agent. */
export interface CommandsConfig {
  before?: string[];
  after?: string[];
}

export interface CopilotAgentOptions {
  /** Pass --reasoning-effort <level>. Alias: effort. */
  reasoningEffort?: "low" | "medium" | "high" | "xhigh";
  /** Alias for reasoningEffort. */
  effort?: "low" | "medium" | "high" | "xhigh";
  /** Pass --add-dir <directory> for each entry. */
  addDir?: string[];
  /** Pass --add-github-mcp-tool <tool> for each entry. */
  addGithubMcpTool?: string[];
  /** Pass --add-github-mcp-toolset <toolset> for each entry. */
  addGithubMcpToolset?: string[];
  /** Pass --additional-mcp-config <json-or-@file> for each entry. */
  additionalMcpConfig?: string[];
  /** Pass --agent <agent>. */
  agent?: string;
  /** Pass --allow-all (default: false). */
  allowAll?: boolean;
  /** Pass --allow-all-tools (default: true) */
  allowAllTools?: boolean;
  /** Pass --allow-all-paths (default: true) */
  allowAllPaths?: boolean;
  /** Pass --allow-all-urls (default: false). */
  allowAllUrls?: boolean;
  /** Pass --allow-tool=<tool> for each entry. */
  allowTool?: string[];
  /** Pass --allow-url=<url-or-domain> for each entry. */
  allowUrl?: string[];
  /** Pass --autopilot. */
  autopilot?: boolean;
  /** Pass --available-tools=<tool> for each entry. */
  availableTools?: string[];
  /** Pass --banner. */
  banner?: boolean;
  /** Pass --bash-env[=on|off]. */
  bashEnv?: "on" | "off" | boolean;
  /** Pass --deny-tool=<tool> for each entry. */
  denyTool?: string[];
  /** Pass --deny-url=<url-or-domain> for each entry. */
  denyUrl?: string[];
  /** Pass --disable-builtin-mcps. */
  disableBuiltinMcps?: boolean;
  /** Pass --disable-mcp-server <server-name> for each entry. */
  disableMcpServer?: string[];
  /** Pass --disallow-temp-dir. */
  disallowTempDir?: boolean;
  /** Pass --enable-all-github-mcp-tools. */
  enableAllGithubMcpTools?: boolean;
  /** Pass --enable-reasoning-summaries. */
  enableReasoningSummaries?: boolean;
  /** Pass --excluded-tools=<tool> for each entry. */
  excludedTools?: string[];
  /** Pass --experimental / --no-experimental. */
  experimental?: boolean;
  /** Pass --output-format (default: "json") */
  outputFormat?: "json" | "text";
  /** Pass --log-dir <directory>. */
  logDir?: string;
  /** Pass --log-level <level>. */
  logLevel?:
    | "none"
    | "error"
    | "warning"
    | "info"
    | "debug"
    | "all"
    | "default";
  /** Pass --max-autopilot-continues <count>. */
  maxAutopilotContinues?: number;
  /** Pass --mode <mode>. */
  mode?: "interactive" | "plan" | "autopilot";
  /** Pass --mouse[=on|off]. */
  mouse?: "on" | "off" | boolean;
  /** Pass --no-ask-user. */
  noAskUser?: boolean;
  /** Pass --no-auto-update. */
  noAutoUpdate?: boolean;
  /** Pass --no-bash-env. */
  noBashEnv?: boolean;
  /** Pass --no-color. */
  noColor?: boolean;
  /** Pass --no-custom-instructions. */
  noCustomInstructions?: boolean;
  /** Pass --no-mouse. */
  noMouse?: boolean;
  /** Pass --no-remote. */
  noRemote?: boolean;
  /** Pass --plain-diff. */
  plainDiff?: boolean;
  /** Pass --plugin-dir <directory> for each entry. */
  pluginDir?: string[];
  /** Pass --remote. */
  remote?: boolean;
  /** Pass --resume or --resume=<session-id>. */
  resume?: boolean | string;
  /** Pass --connect or --connect=<session-id>. */
  connect?: boolean | string;
  /** Pass --continue. */
  continue?: boolean;
  /** Pass --plan. */
  plan?: boolean;
  /** Pass --silent. */
  silent?: boolean;
  /** Pass --screen-reader. */
  screenReader?: boolean;
  /** Pass --secret-env-vars=<name> for each entry. */
  secretEnvVars?: string[];
  /** Pass --share or --share=<path>. Supports {workspacePath} template. */
  share?: boolean | string;
  /** Pass --share-gist. */
  shareGist?: boolean;
  /** Pass --stream <mode>. */
  stream?: "on" | "off";
  /** Pass --yolo (default: false). */
  yolo?: boolean;
  /** Pass --config-dir. Supports {workspacePath} template. Defaults to workspace path. */
  configDir?: string;
}

export interface GeminiAgentOptions {
  /** Pass --debug. */
  debug?: boolean;
  /** Pass --model <model>. */
  model?: string;
  /** Pass --worktree or --worktree <name>. */
  worktree?: boolean | string;
  /** Pass --sandbox. */
  sandbox?: boolean;
  /** Pass --yolo to auto-approve all tool actions (default: true) */
  yolo?: boolean;
  /** Pass --approval-mode <mode>. */
  approvalMode?: "default" | "auto_edit" | "yolo" | "plan";
  /** Pass --policy <path> for each entry. Supports {workspacePath} template. */
  policy?: string[];
  /** Pass --admin-policy <path> for each entry. Supports {workspacePath} template. */
  adminPolicy?: string[];
  /** Pass --acp. */
  acp?: boolean;
  /** Pass --experimental-acp. */
  experimentalAcp?: boolean;
  /** Pass --allowed-mcp-server-names <name> for each entry. */
  allowedMcpServerNames?: string[];
  /** Pass --allowed-tools <tool> for each entry. */
  allowedTools?: string[];
  /** Pass --extensions <name> for each entry. */
  extensions?: string[];
  /** Pass --resume <session>. */
  resume?: string;
  /** Pass --include-directories <path> for each entry. Supports {workspacePath} template. */
  includeDirectories?: string[];
  /** Pass --screen-reader. */
  screenReader?: boolean;
  /** Pass --output-format <format>. */
  outputFormat?: "text" | "json" | "stream-json";
  /** Pass --raw-output. */
  rawOutput?: boolean;
  /** Pass --accept-raw-output-risk. */
  acceptRawOutputRisk?: boolean;
}

export interface ClaudeCodeAgentOptions {
  /** Pass --add-dir <path> for each entry. */
  addDir?: string[];
  /** Pass --resume <session-id>. */
  resume?: string;
  /** Pass --continue. */
  continue?: boolean;
  /** Pass --verbose. */
  verbose?: boolean;
  /** Pass --max-turns <n>. */
  maxTurns?: number;
  /** Pass --system-prompt <prompt>. */
  systemPrompt?: string;
  /** Pass --append-system-prompt <prompt>. */
  appendSystemPrompt?: string;
  /** Pass --allowedTools <tools> for each entry. */
  allowedTools?: string[];
  /** Pass --disallowedTools <tools> for each entry. */
  disallowedTools?: string[];
  /** Pass --output-format <format> (default: "json"). */
  outputFormat?: "text" | "json" | "stream-json";
  /** Pass --dangerously-skip-permissions (default: true). */
  dangerouslySkipPermissions?: boolean;
}

export interface OpencodeAgentOptions {
  /** Pass --agent <agent>. */
  agent?: string;
  /** Pass --continue. */
  continue?: boolean;
  /** Pass --session <id>. */
  session?: string;
  /** Pass --fork. */
  fork?: boolean;
  /** Pass --share. */
  share?: boolean;
  /** Pass --file <path> for each entry. Supports {workspacePath} template. */
  file?: string[];
  /** Pass --title <title>. */
  title?: string;
  /** Pass --attach <url>. */
  attach?: string;
  /** Pass --password <password>. */
  password?: string;
  /** Pass --dir <path>. Supports {workspacePath} template. */
  dir?: string;
  /** Pass --port <port>. */
  port?: number;
  /** Pass --variant <variant>. */
  variant?: string;
  /** Pass --thinking. */
  thinking?: boolean;
  /** Pass --dangerously-skip-permissions (default: true). */
  dangerouslySkipPermissions?: boolean;
  /** Pass --command <command>. */
  command?: string;
  /** Pass --pure. */
  pure?: boolean;
  /** Pass --log-level <level>. */
  logLevel?: "DEBUG" | "INFO" | "WARN" | "ERROR";
  /** Pass --print-logs. */
  printLogs?: boolean;
}

export interface AgentConfig {
  type: string;
  /** Executable name, e.g. "copilot" or "gemini" */
  cmd?: string;
  /**
   * CLI args. Supports template variables:
   *   {workspacePath}     – absolute path to workspace root
   *   {prompt}            – raw task prompt string
   */
  args?: string[];
  model?: string;
  model_params?: Record<string, unknown>;
  /** USD cost per 1 million tokens, used for cost estimation. */
  costPerMillionTokens?: number;
  /** Explicit per-model pricing using real input/output token counts. */
  pricing?: ModelPricing;
  /** Tool-specific CLI options. Fields depend on the agent type. */
  options?: ClaudeCodeAgentOptions | CopilotAgentOptions | GeminiAgentOptions | OpencodeAgentOptions;
}

/** Interface that every agent adapter must implement */
export interface AgentAdapter {
  name: string;
  /**
   * Verifies the agent is installed and ready (authenticated, etc.).
   * Should throw an Error with a human-readable message if not healthy.
   */
  healthcheck(config: AgentConfig): Promise<void>;
  /** Returns the installed version string, or "unknown" on failure. */
  getVersion(config: AgentConfig): string;
  invoke(
    workspacePath: string,
    variant: VariantConfig,
  ): Promise<AgentInvokeResult>;
}

export interface AgentInvokeResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  startedAt: Date;
  completedAt: Date;
}

// ── Metrics ───────────────────────────────────────────────────────────────────

export interface ComplexityResult {
  cyclomatic: number;
  filesAnalyzed: number;
}

export interface Metrics {
  timeMs: number;
  lineCount: number;
  tokenCount: number;
  estimatedCostUsd: number | null;
  complexity: ComplexityResult | null;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

export interface CriterionScore {
  criterion: string;
  score: number;
  reasoning: string;
}

export interface ModelPricing {
  inputCostPerMillionTokens: number;
  outputCostPerMillionTokens: number;
}

export interface LLMJudgeResult {
  score: number;
  criteria: CriterionScore[];
  reasoning: string;
  summary: string;
  provider: JudgeProvider;
  model: string;
  tokenUsage?: TokenUsage | null;
}

export interface TestResult {
  name: string;
  success: boolean;
  score: number;
  output: string;
}

export interface ScoringResult {
  llmJudge?: LLMJudgeResult;
  checks?: TestResult[];
  /** Weighted average of all available scores, null if none scored yet */
  overall: number | null;
}

// ── Run ───────────────────────────────────────────────────────────────────────

export interface ModelParams {
  model: string | null;
  temperature: number | null;
  maxTokens: number | null;
}

export interface TokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface RunResult {
  runId: string;
  runSetId: string;
  variantName: string;
  agentName: string;
  agentVersion?: string;
  agentConfig: AgentConfig;
  attemptNumber: number;
  startedAt: string;
  completedAt: string;
  modelParams: ModelParams;
  tokenUsage: TokenUsage | null;
  metrics: Metrics;
  scoring: ScoringResult;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  workspacePath: string;
}

export interface StatSummary {
  mean: number;
  min: number;
  max: number;
  stddev: number;
}

export interface RunSetSummary {
  runSetId: string;
  variantName: string;
  agentName: string;
  agentVersion?: string;
  agentConfig: AgentConfig;
  totalRuns: number;
  completedAt: string;
  metrics: {
    timeMs: StatSummary;
    lineCount: StatSummary;
    tokenCount: StatSummary;
    estimatedCostUsd: StatSummary | null;
  };
  scoring: {
    overall: StatSummary | null;
    llmJudge?: StatSummary | null;
    checks?: StatSummary | null;
  };
  runIds: string[];
}

// ── Config ────────────────────────────────────────────────────────────────────

export type Measurements =
  | {
      type: "judge";
      provider: JudgeProvider;
      model?: string;
      /** Acceptance criteria used by the LLM judge for this variant */
      acceptanceCriteria?: string[];
    }
  | {
      type: "shell";
      name: string;
      command: string;
      scoreIfPasses: number;
      scoreIfFails: number;
    };

/**
 * A named, self-contained benchmark variant that combines a specific agent,
 * task, and optional parameter/setup overrides into a comparable unit.
 */
export interface VariantConfig {
  name: string;

  agent?: Partial<AgentConfig>;
  /** Overrides / extends the agent's setup config */
  setup?: Partial<SetupConfig>;
  /** Prompts that will be sent to the agent to work on the benchmark */
  query?: string[];
  /** Shell commands to run in workspace before/after the agent */
  commands?: CommandsConfig;
}

/**
 * Default values applied to every variant before its own settings.
 * Variants can override any of these fields.
 */
export type VariantDefaults = Omit<VariantConfig, "name">;

export type RunOptions = {
  runCount: number;
  parallel: boolean;
  outputDir: string;
};

export interface BenchConfig {
  name: string;
  /** Optional description shown at the top of summary.md */
  description?: string;
  options?: RunOptions;

  variantDefaults?: VariantDefaults;
  variants: VariantConfig[];
  measure: Measurements[];
}
