import { execSync } from "child_process";
import crypto from "crypto";
import { getAgentVersion } from "../agents/base";
import { getAdapter } from "../agents/index";
import { collectMetrics } from "../metrics";
import {
  listRunSets,
  readSummary,
  saveWorkspaceFiles,
  writeAgentLogs,
  writeJudgeNotes,
  writeRun,
} from "../persistence";
import { scoreRun } from "../scorers/index";
import type {
  AgentConfig,
  BenchConfig,
  ModelParams,
  RunResult,
  TokenUsage,
  VariantConfig,
} from "../types";
import { createWorkspace } from "./workspace";

export interface RunOptions {
  runSetId: string;
  attemptNumber: number;
  variantName?: string;
  keepWorkspace?: boolean;
  onJudgeStart?: () => void;
}

/** Extracts model/temperature/maxTokens from agent config. */
function buildModelParams(config: AgentConfig): ModelParams {
  const mp = config.model_params ?? {};
  return {
    model: config.model ?? null,
    temperature: typeof mp.temperature === "number" ? mp.temperature : null,
    maxTokens:
      typeof mp.max_tokens === "number"
        ? mp.max_tokens
        : typeof mp.maxTokens === "number"
          ? mp.maxTokens
          : null,
  };
}

/**
 * Tries to parse LLM token usage from agent stdout.
 * Supports Claude JSON output (`--output-format json`) and
 * Copilot JSONL output (`--output-format json`).
 */
function parseTokenUsage(stdout: string): TokenUsage | null {
  // Claude: single JSON object with usage.input_tokens / usage.output_tokens
  try {
    const obj = JSON.parse(stdout.trim()) as Record<string, unknown>;
    const usage = obj.usage as Record<string, unknown> | undefined;
    if (usage && typeof usage.input_tokens === "number") {
      return {
        inputTokens: usage.input_tokens,
        outputTokens:
          typeof usage.output_tokens === "number" ? usage.output_tokens : null,
      };
    }
    // top-level total_input_tokens (older Claude format)
    if (typeof obj.total_input_tokens === "number") {
      return {
        inputTokens: obj.total_input_tokens,
        outputTokens:
          typeof obj.total_output_tokens === "number"
            ? obj.total_output_tokens
            : null,
      };
    }
  } catch {
    // not a single JSON object – try JSONL
  }

  // Copilot / stream-json: scan lines for a usage event
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const event = JSON.parse(trimmed) as Record<string, unknown>;
      const usage = event.usage as Record<string, unknown> | undefined;
      if (usage) {
        if (typeof usage.input_tokens === "number")
          inputTokens = usage.input_tokens;
        if (typeof usage.output_tokens === "number")
          outputTokens = usage.output_tokens;
      }
    } catch {
      // skip non-JSON lines
    }
  }
  if (inputTokens !== null || outputTokens !== null) {
    return { inputTokens, outputTokens };
  }

  return null;
}

/**
 * Executes a single benchmark run:
 *   workspace → agent → metrics → scoring → persist
 */
export async function runOnce(
  variant: VariantConfig,
  agentConfig: AgentConfig,
  benchConfig: BenchConfig,
  options: RunOptions,
): Promise<RunResult> {
  const { runSetId, attemptNumber, onJudgeStart } = options;
  const runId = crypto.randomUUID();

  // 1. Create isolated workspace
  const mergedSetup = {
    ...benchConfig.variantDefaults?.setup,
    ...variant.setup,
  };
  const mergedQuery = [
    ...(benchConfig.variantDefaults?.query ?? []),
    ...(variant.query ?? []),
  ];

  // Effective variant with merged setup and query (used for workspace creation and agent args)
  const effectiveVariant = {
    ...variant,
    setup: Object.keys(mergedSetup).length > 0 ? mergedSetup : variant.setup,
    query: mergedQuery.length > 0 ? mergedQuery : variant.query,
  };

  const workspacePath = createWorkspace(
    effectiveVariant,
    Object.keys(mergedSetup).length > 0 ? mergedSetup : undefined,
  );

  // 2. Run before-commands in workspace (defaults merged with variant)
  const beforeCmds = [
    ...(benchConfig.variantDefaults?.commands?.before ?? []),
    ...(variant.commands?.before ?? []),
  ];
  for (const cmd of beforeCmds) {
    execSync(cmd, { cwd: workspacePath, stdio: "pipe" });
  }

  // 3. Invoke agent
  const adapter = getAdapter(agentConfig);
  const agentVersion = getAgentVersion(agentConfig);
  const invokeResult = await adapter.invoke(
    workspacePath,
    effectiveVariant,
    agentConfig,
  );

  // 4. Run after-commands in workspace (defaults merged with variant)
  const afterCmds = [
    ...(benchConfig.variantDefaults?.commands?.after ?? []),
    ...(variant.commands?.after ?? []),
  ];
  for (const cmd of afterCmds) {
    execSync(cmd, { cwd: workspacePath, stdio: "pipe" });
  }

  // 5. Collect metrics
  const metrics = await collectMetrics(
    workspacePath,
    invokeResult.stdout,
    invokeResult.startedAt,
    invokeResult.completedAt,
    agentConfig.costPerMillionTokens,
  );

  // 6. Score the output
  onJudgeStart?.();
  const effectiveCriteria =
    variant.acceptanceCriteria ??
    benchConfig.variantDefaults?.acceptanceCriteria ??
    benchConfig.acceptanceCriteria;
  const scoring = await scoreRun(
    workspacePath,
    { ...benchConfig, acceptanceCriteria: effectiveCriteria },
    invokeResult,
    benchConfig.judge,
  );

  const result: RunResult = {
    runId,
    runSetId,
    variantName: variant.name,
    agentName: agentConfig.name,
    agentVersion,
    agentConfig,
    attemptNumber,
    startedAt: invokeResult.startedAt.toISOString(),
    completedAt: invokeResult.completedAt.toISOString(),
    modelParams: buildModelParams(agentConfig),
    tokenUsage: parseTokenUsage(invokeResult.stdout),
    metrics,
    scoring,
    stdout: invokeResult.stdout,
    stderr: invokeResult.stderr,
    exitCode: invokeResult.exitCode,
    workspacePath,
  };

  // 7. Persist
  writeRun(result, benchConfig.outputDir);
  writeAgentLogs(
    runSetId,
    attemptNumber,
    invokeResult.stdout,
    invokeResult.stderr,
    benchConfig.outputDir,
  );
  saveWorkspaceFiles(
    runSetId,
    attemptNumber,
    workspacePath,
    benchConfig.outputDir,
  );
  writeJudgeNotes(runSetId, attemptNumber, result, benchConfig.outputDir);

  return result;
}

/**
 * Runs a task N times and returns all results.
 */
/** Counts how many runs already exist for a (variantName, agentName, agentVersion) combo. */
function countExistingRuns(
  variantName: string,
  agentName: string,
  agentVersion: string,
  outputDir: string,
): { count: number; runSetId: string | null } {
  let best: { count: number; runSetId: string } | null = null;
  for (const id of listRunSets(outputDir)) {
    try {
      const summary = readSummary(id, outputDir);
      if (
        summary.variantName === variantName &&
        summary.agentName === agentName &&
        summary.agentVersion === agentVersion
      ) {
        if (best === null || summary.totalRuns > best.count) {
          best = { count: summary.totalRuns, runSetId: id };
        }
      }
    } catch {
      // skip unreadable
    }
  }
  return best ?? { count: 0, runSetId: null };
}

export async function runTask(
  variant: VariantConfig,
  agentConfig: AgentConfig,
  benchConfig: BenchConfig,
  runs: number,
  runSetId: string,
  onProgress?: (attempt: number, total: number, result: RunResult) => void,
  onAttemptStart?: (attempt: number, total: number) => void,
  variantName?: string,
  onJudgeStart?: () => void,
): Promise<RunResult[]> {
  const results: RunResult[] = [];

  const agentVersion = getAgentVersion(agentConfig);
  const { count: existingCount } = countExistingRuns(
    variant.name,
    agentConfig.name,
    agentVersion,
    benchConfig.outputDir,
  );

  const remaining = runs - existingCount;
  if (remaining <= 0) return results;

  for (let i = 1; i <= remaining; i++) {
    const attemptNumber = existingCount + i;
    onAttemptStart?.(attemptNumber, runs);
    const result = await runOnce(variant, agentConfig, benchConfig, {
      runSetId,
      attemptNumber,
      variantName,
      onJudgeStart,
    });
    results.push(result);
    onProgress?.(attemptNumber, runs, result);
  }

  return results;
}
