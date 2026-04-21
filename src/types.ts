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

export interface LLMJudgeResult {
  score: number;
  criteria: CriterionScore[];
  reasoning: string;
  summary: string;
  provider: JudgeProvider;
  model: string;
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

export interface JudgeConfig {
  provider: JudgeProvider;
  model?: string;
}

export interface CheckConfig {
  name: string;
  command: string;
  scoreIfPasses: number;
  scoreIfFails: number;
}

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
  /** Acceptance criteria used by the LLM judge for this variant */
  acceptanceCriteria?: string[];
  /** Shell command checks run after the agent; each contributes a score */
  checks?: CheckConfig[];
}

/**
 * Default values applied to every variant before its own settings.
 * Variants can override any of these fields.
 */
export type VariantDefaults = Omit<VariantConfig, "name">;

export interface BenchConfig {
  name: string;

  variantDefaults?: VariantDefaults;
  variants: VariantConfig[];
  acceptanceCriteria: string[];
  /** Top-level checks applied to every variant run */
  checks?: CheckConfig[];
  runCount: number;
  parallel: boolean;
  outputDir: string;
  judge: JudgeConfig;
}
