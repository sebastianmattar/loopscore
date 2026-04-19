import crypto from "crypto";
import { getAdapter } from "../agents";
import { collectMetrics } from "../metrics";
import { writeRun } from "../persistence";
import { scoreRun } from "../scorers";
import type { AgentConfig, BenchConfig, RunResult, Task } from "../types";
import { createWorkspace } from "./workspace";

export interface RunOptions {
  runSetId: string;
  attemptNumber: number;
  keepWorkspace?: boolean;
}

/**
 * Executes a single benchmark run:
 *   workspace → agent → metrics → scoring → persist
 */
export async function runOnce(
  task: Task,
  agentConfig: AgentConfig,
  benchConfig: BenchConfig,
  options: RunOptions,
): Promise<RunResult> {
  const { runSetId, attemptNumber } = options;
  const runId = crypto.randomUUID();

  // 1. Create isolated workspace
  const workspacePath = createWorkspace(task, agentConfig.setup);

  // 2. Invoke agent
  const adapter = getAdapter(agentConfig);
  const invokeResult = await adapter.invoke(workspacePath, task, agentConfig);

  // 3. Collect metrics
  const metrics = await collectMetrics(
    workspacePath,
    invokeResult.stdout,
    invokeResult.startedAt,
    invokeResult.completedAt,
  );

  // 4. Score the output
  const scoring = await scoreRun(
    workspacePath,
    task,
    invokeResult,
    benchConfig.judge,
  );

  const result: RunResult = {
    runId,
    runSetId,
    taskId: task.id,
    agentName: agentConfig.name,
    agentConfig,
    attemptNumber,
    startedAt: invokeResult.startedAt.toISOString(),
    completedAt: invokeResult.completedAt.toISOString(),
    metrics,
    scoring,
    stdout: invokeResult.stdout,
    stderr: invokeResult.stderr,
    exitCode: invokeResult.exitCode,
    workspacePath,
  };

  // 5. Persist
  writeRun(result, benchConfig.runsDir);

  return result;
}

/**
 * Runs a task N times and returns all results.
 */
export async function runTask(
  task: Task,
  agentConfig: AgentConfig,
  benchConfig: BenchConfig,
  runs: number,
  runSetId: string,
  onProgress?: (attempt: number, total: number, result: RunResult) => void,
): Promise<RunResult[]> {
  const results: RunResult[] = [];

  for (let i = 1; i <= runs; i++) {
    const result = await runOnce(task, agentConfig, benchConfig, {
      runSetId,
      attemptNumber: i,
    });
    results.push(result);
    onProgress?.(i, runs, result);
  }

  return results;
}
