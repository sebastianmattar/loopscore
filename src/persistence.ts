import fs from "fs";
import path from "path";
import type { RunResult, RunSetSummary, StatSummary } from "./types";

// ── Write ─────────────────────────────────────────────────────────────────────

export function writeRun(result: RunResult, runsDir: string): string {
  const runSetDir = path.join(runsDir, result.runSetId);
  fs.mkdirSync(runSetDir, { recursive: true });

  const filePath = path.join(runSetDir, `run-${result.attemptNumber}.json`);
  fs.writeFileSync(filePath, JSON.stringify(result, null, 2), "utf-8");
  return filePath;
}

export function writeSummary(
  results: RunResult[],
  runsDir: string,
  runSetId: string,
): string {
  if (results.length === 0) {
    throw new Error("Cannot write summary: no results provided");
  }

  const first = results[0];
  const summary: RunSetSummary = {
    runSetId,
    taskId: first.taskId,
    agentName: first.agentName,
    agentConfig: first.agentConfig,
    totalRuns: results.length,
    completedAt: new Date().toISOString(),
    metrics: {
      timeMs: computeStat(results.map((r) => r.metrics.timeMs)),
      lineCount: computeStat(results.map((r) => r.metrics.lineCount)),
      tokenCount: computeStat(results.map((r) => r.metrics.tokenCount)),
    },
    scoring: {
      overall: results.some((r) => r.scoring.overall != null)
        ? computeStat(
            results
              .map((r) => r.scoring.overall)
              .filter((s): s is number => s != null),
          )
        : null,
    },
    runIds: results.map((r) => r.runId),
  };

  const runSetDir = path.join(runsDir, runSetId);
  fs.mkdirSync(runSetDir, { recursive: true });

  const filePath = path.join(runSetDir, "summary.json");
  fs.writeFileSync(filePath, JSON.stringify(summary, null, 2), "utf-8");
  return filePath;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export function readRun(filePath: string): RunResult {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as RunResult;
}

export function readSummary(runSetId: string, runsDir: string): RunSetSummary {
  const filePath = path.join(runsDir, runSetId, "summary.json");
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Summary not found for run set "${runSetId}". Did you run \`bench run\` first?`,
    );
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as RunSetSummary;
}

export function listRunSets(runsDir: string): string[] {
  if (!fs.existsSync(runsDir)) return [];
  return fs
    .readdirSync(runsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse(); // newest first
}

export function listRunFiles(runSetId: string, runsDir: string): string[] {
  const runSetDir = path.join(runsDir, runSetId);
  if (!fs.existsSync(runSetDir)) return [];
  return fs
    .readdirSync(runSetDir)
    .filter((f) => f.startsWith("run-") && f.endsWith(".json"))
    .map((f) => path.join(runSetDir, f))
    .sort();
}

/** Patches a specific run-N.json in place (used by `bench review`). */
export function patchRun(
  runSetId: string,
  attemptNumber: number,
  runsDir: string,
  patch: Partial<RunResult>,
): void {
  const filePath = path.join(runsDir, runSetId, `run-${attemptNumber}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Run file not found: ${filePath}`);
  }
  const existing = readRun(filePath);
  const updated = { ...existing, ...patch };
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), "utf-8");
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function computeStat(values: number[]): StatSummary {
  if (values.length === 0) {
    return { mean: 0, min: 0, max: 0, stddev: 0 };
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const variance =
    values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
  const stddev = Math.sqrt(variance);
  return {
    mean: +mean.toFixed(4),
    min,
    max,
    stddev: +stddev.toFixed(4),
  };
}
