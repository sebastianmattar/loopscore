export type ScoringMethod = "llm-judge" | "tests" | "manual";

export type JudgeProvider = "copilot" | "openai" | "anthropic";

// ── Task ──────────────────────────────────────────────────────────────────────

export interface TaskFrontmatter {
  id: string;
  title: string;
  prompt: string;
  model_params?: Record<string, unknown>;
  acceptance_criteria: string[];
  scoring?: {
    methods?: ScoringMethod[];
    tests_cmd?: string;
  };
}

export interface Task extends TaskFrontmatter {
  body: string;
  filePath: string;
}

// ── Agent ─────────────────────────────────────────────────────────────────────

export interface SetupConfig {
  /** Path to a directory containing skill files to copy into the workspace */
  skillsDir?: string;
  /** Path to an agents.md file to copy into the workspace */
  agentsMd?: string;
  /** Path to an mcp.json file to copy into the workspace */
  mcpJson?: string;
}

export interface AgentConfig {
  name: string;
  /** Executable name, e.g. "gh" or "kiro" */
  cmd: string;
  /**
   * CLI args. Supports template variables:
   *   {requirementsFile}  – absolute path to requirements.md in workspace
   *   {workspacePath}     – absolute path to workspace root
   *   {prompt}            – raw task prompt string
   */
  args?: string[];
  model?: string;
  model_params?: Record<string, unknown>;
  setup?: SetupConfig;
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
    task: Task,
    config: AgentConfig,
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

export interface ManualResult {
  score: number | null;
  notes: string | null;
  reviewedAt: string | null;
  pending: boolean;
}

export interface ScoringResult {
  methods: ScoringMethod[];
  llmJudge?: LLMJudgeResult;
  tests?: TestResult;
  manual?: ManualResult;
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
  variantName?: string;
  taskId: string;
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
  variantName?: string;
  taskId: string;
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
  /** API key or token. Falls back to provider-specific env vars. */
  apiKey?: string;
}

/**
 * Default values applied to every variant before its own settings.
 * Variants can override any of these fields.
 */
export interface VariantDefaults {
  /** Default agent name */
  agent?: string;
  /** Default task ID */
  task?: string;
  /** Default model override */
  model?: string;
  /** Default model_params (shallow-merged, variant wins on key conflicts) */
  model_params?: Record<string, unknown>;
  /** Default setup config (shallow-merged, variant wins on key conflicts) */
  setup?: SetupConfig;
}

/**
 * A named, self-contained benchmark variant that combines a specific agent,
 * task, and optional parameter/setup overrides into a comparable unit.
 */
export interface VariantConfig {
  name: string;
  /** Agent name — must exist in agentsDir or the agents list */
  agent?: string;
  /** Task ID — looked up from tasksDir */
  task?: string;
  /** Overrides the agent's default model */
  model?: string;
  /** Merged on top of the agent's model_params */
  model_params?: Record<string, unknown>;
  /** Overrides / extends the agent's setup config */
  setup?: SetupConfig;
}

export interface BenchConfig {
  agents: AgentConfig[];
  agentsDir?: string;
  variantDefaults?: VariantDefaults;
  variants?: VariantConfig[];
  defaultRuns: number;
  parallel: boolean;
  runsDir: string;
  tasksDir: string;
  judge?: JudgeConfig;
}
