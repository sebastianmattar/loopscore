import { execSync } from "child_process";
import crypto from "crypto";
import { getAgentVersion } from "../agents/base";
import { getAdapter } from "../agents/index";
import { collectMetrics } from "../metrics";
import {
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
  const { runSetId, attemptNumber } = options;
  const runId = crypto.randomUUID();

  // 1. Create isolated workspace
  const workspacePath = createWorkspace(variant);

  // 2. Run before-commands in workspace
  for (const cmd of variant.commands?.before ?? []) {
    execSync(cmd, { cwd: workspacePath, stdio: "pipe" });
  }

  // 3. Invoke agent
  const adapter = getAdapter(agentConfig);
  const agentVersion = getAgentVersion(agentConfig);
  const invokeResult = await adapter.invoke(
    workspacePath,
    variant,
    agentConfig,
  );

  // 4. Run after-commands in workspace
  for (const cmd of variant.commands?.after ?? []) {
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
  const scoring = await scoreRun(
    workspacePath,
    benchConfig,
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
  writeRun(result, benchConfig.runsDir);
  writeAgentLogs(
    runSetId,
    attemptNumber,
    invokeResult.stdout,
    invokeResult.stderr,
    benchConfig.runsDir,
  );
  saveWorkspaceFiles(
    runSetId,
    attemptNumber,
    workspacePath,
    benchConfig.runsDir,
  );
  writeJudgeNotes(runSetId, attemptNumber, result, benchConfig.runsDir);

  return result;
}

/**
 * Runs a task N times and returns all results.
 */
export async function runTask(
  variant: VariantConfig,
  agentConfig: AgentConfig,
  benchConfig: BenchConfig,
  runs: number,
  runSetId: string,
  onProgress?: (attempt: number, total: number, result: RunResult) => void,
  onAttemptStart?: (attempt: number, total: number) => void,
  variantName?: string,
): Promise<RunResult[]> {
  const results: RunResult[] = [];

  for (let i = 1; i <= runs; i++) {
    onAttemptStart?.(i, runs);
    const result = await runOnce(variant, agentConfig, benchConfig, {
      runSetId,
      attemptNumber: i,
      variantName,
    });
    results.push(result);
    onProgress?.(i, runs, result);
  }

  return results;
}
