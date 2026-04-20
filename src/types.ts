export type JudgeProvider = "copilot";

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

export interface AgentConfig {
  name: string;
  /** Executable name, e.g. "copilot" or "gemini" */
  cmd: string;
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
}

/** Interface that every agent adapter must implement */
export interface AgentAdapter {
  name: string;
  /**
   * Verifies the agent is installed and ready (authenticated, etc.).
   * Should throw an Error with a human-readable message if not healthy.
   */
  healthcheck(config: AgentConfig): Promise<void>;
  invoke(
    workspacePath: string,
    variant: VariantConfig,
    agentConfig: AgentConfig,
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

export interface LLMJudgeResult {
  score: number;
  criteria: CriterionScore[];
  reasoning: string;
  summary: string;
  provider: JudgeProvider;
  model: string;
}

export interface TestResult {
  passed: number;
  failed: number;
  total: number;
  score: number;
  output: string;
}

export interface ScoringResult {
  llmJudge?: LLMJudgeResult;
  tests?: TestResult;
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
  };
  runIds: string[];
}

// ── Config ────────────────────────────────────────────────────────────────────

export interface JudgeConfig {
  provider: JudgeProvider;
  model?: string;
}

/**
 * A named, self-contained benchmark variant that combines a specific agent,
 * task, and optional parameter/setup overrides into a comparable unit.
 */
export interface VariantConfig {
  name: string;
  /** Agent name — must match a built-in adapter or an entry in the agents list */
  agent?: string;
  /** Override the agent executable */
  cmd?: string;
  /** Override the agent CLI args */
  args?: string[];
  /** Overrides the agent's default model */
  model?: string;
  /** Merged on top of the agent's model_params */
  model_params?: Record<string, unknown>;
  /** Overrides / extends the agent's setup config */
  setup?: SetupConfig;
  /** USD cost per 1 million tokens */
  costPerMillionTokens?: number;
  /** Prompts that will be sent to the agent to work on the benchmark */
  query?: string[];
  /** Shell commands to run in workspace before/after the agent */
  commands?: CommandsConfig;
  /** Acceptance criteria used by the LLM judge for this variant */
  acceptanceCriteria?: string[];
}

/**
 * Default values applied to every variant before its own settings.
 * Variants can override any of these fields.
 */
export type VariantDefaults = Omit<VariantConfig, "name">;

export interface BenchConfig {
  name: string;
  agents: AgentConfig[];
  variantDefaults?: VariantDefaults;
  variants: VariantConfig[];
  acceptanceCriteria: string[];
  runCount: number;
  parallel: boolean;
  outputDir: string;
  judge: JudgeConfig;
}
