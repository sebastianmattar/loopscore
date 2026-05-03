import { execSync } from "child_process";
import crypto from "crypto";
import { toMerged } from "es-toolkit";

import { getAdapter } from "../agents/index.js";
import { collectMetrics } from "../metrics.js";
import {
  listRunSets,
  readSummary,
  saveWorkspaceFiles,
  writeAgentLogs,
  writeJudgeNotes,
  writeRun,
} from "../persistence.js";
import { scoreRun } from "../scorers/index.js";
import type {
  AgentConfig,
  BenchConfig,
  ModelParams,
  RunResult,
  TokenUsage,
  VariantConfig,
} from "../types.js";
import { createWorkspace } from "./workspace.js";

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
 * Supports Claude JSON output, Copilot JSONL output,
 * and opencode JSON event streams.
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
        if (typeof usage.input_tokens === "number") {
          inputTokens = usage.input_tokens;
        }
        if (typeof usage.output_tokens === "number") {
          outputTokens = usage.output_tokens;
        }
        if (typeof usage.inputTokens === "number") {
          inputTokens = usage.inputTokens;
        }
        if (typeof usage.outputTokens === "number") {
          outputTokens = usage.outputTokens;
        }
      }

      const data = event.data as Record<string, unknown> | undefined;
      const dataUsage = data?.usage as Record<string, unknown> | undefined;
      if (dataUsage) {
        if (typeof dataUsage.input_tokens === "number") {
          inputTokens = dataUsage.input_tokens;
        }
        if (typeof dataUsage.output_tokens === "number") {
          outputTokens = dataUsage.output_tokens;
        }
        if (typeof dataUsage.inputTokens === "number") {
          inputTokens = dataUsage.inputTokens;
        }
        if (typeof dataUsage.outputTokens === "number") {
          outputTokens = dataUsage.outputTokens;
        }
      }

      if (typeof event.inputTokens === "number") {
        inputTokens = event.inputTokens;
      }
      if (typeof event.outputTokens === "number") {
        outputTokens = event.outputTokens;
      }

      if (typeof data?.inputTokens === "number") {
        inputTokens = data.inputTokens;
      }
      if (typeof data?.outputTokens === "number") {
        outputTokens = data.outputTokens;
      }

      const part = event.part as
        | {
            tokens?: {
              input?: number;
              output?: number;
            };
          }
        | undefined;
      if (part?.tokens) {
        if (typeof part.tokens.input === "number") {
          inputTokens = part.tokens.input;
        }
        if (typeof part.tokens.output === "number") {
          outputTokens = part.tokens.output;
        }
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
  benchConfig: BenchConfig,
  options: RunOptions,
): Promise<RunResult> {
  const { runSetId, attemptNumber, onJudgeStart } = options;
  const runId = crypto.randomUUID();

  // Effective variant with merged setup and query (used for workspace creation and agent args)
  const effectiveVariant = toMerged(
    benchConfig.variantDefaults ?? {},
    variant,
  ) as VariantConfig & { agent: AgentConfig };

  const workspacePath = createWorkspace(effectiveVariant);

  // 2. Run before-commands in workspace (defaults merged with variant)
  const beforeCmds = [
    ...(benchConfig.variantDefaults?.commands?.before ?? []),
    ...(variant.commands?.before ?? []),
  ];
  for (const cmd of beforeCmds) {
    execSync(cmd, { cwd: workspacePath, stdio: "pipe" });
  }

  // 3. Invoke agent
  const adapter = getAdapter(effectiveVariant!.agent!.type!);
  const agentVersion = adapter.getVersion(effectiveVariant!.agent!);
  const invokeResult = await adapter.invoke(workspacePath, effectiveVariant);
  const tokenUsage = parseTokenUsage(invokeResult.stdout);

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
    tokenUsage,
    effectiveVariant.agent.pricing,
    effectiveVariant.agent.costPerMillionTokens,
  );

  // 6. Score the output
  onJudgeStart?.();
  const scoring = await scoreRun(workspacePath, benchConfig, invokeResult);

  const result: RunResult = {
    runId,
    runSetId,
    variantName: variant.name,
    agentName: effectiveVariant.agent.type,
    agentVersion,
    agentConfig: effectiveVariant.agent,
    attemptNumber,
    startedAt: invokeResult.startedAt.toISOString(),
    completedAt: invokeResult.completedAt.toISOString(),
    modelParams: buildModelParams(effectiveVariant.agent),
    tokenUsage,
    metrics,
    scoring,
    stdout: invokeResult.stdout,
    stderr: invokeResult.stderr,
    exitCode: invokeResult.exitCode,
    workspacePath,
  };

  // 7. Persist
  const outputDir = benchConfig.options!.outputDir;
  writeRun(result, outputDir);
  writeAgentLogs(
    runSetId,
    attemptNumber,
    invokeResult.stdout,
    invokeResult.stderr,
    outputDir,
  );
  saveWorkspaceFiles(runSetId, attemptNumber, workspacePath, outputDir);
  writeJudgeNotes(runSetId, attemptNumber, result, outputDir);

  return result;
}

/**
 * Runs a task N times and returns all results.
 */
/** Counts how many runs already exist for a (variantName, agentName, agentVersion) combo. */
function countExistingRuns(
  variantName: string,
  outputDir: string,
): { count: number; runSetId: string | null } {
  let best: { count: number; runSetId: string } | null = null;
  for (const id of listRunSets(outputDir)) {
    try {
      const summary = readSummary(id, outputDir);
      if (summary.variantName === variantName) {
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
  benchConfig: BenchConfig,
  runs: number,
  runSetId: string,
  force = false,
  onProgress?: (attempt: number, total: number, result: RunResult) => void,
  onAttemptStart?: (attempt: number, total: number) => void,
  variantName?: string,
  onJudgeStart?: () => void,
): Promise<RunResult[]> {
  const results: RunResult[] = [];

  const existingCount = force
    ? 0
    : countExistingRuns(variant.name, benchConfig.options!.outputDir).count;

  const remaining = runs - existingCount;
  if (remaining <= 0) return results;

  for (let i = 1; i <= remaining; i++) {
    const attemptNumber = existingCount + i;
    onAttemptStart?.(attemptNumber, runs);
    const result = await runOnce(variant, benchConfig, {
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
