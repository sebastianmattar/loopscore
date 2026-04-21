import fs from "fs";
import path from "path";
import type { RunResult, RunSetSummary, StatSummary } from "./types";

// ── Write ─────────────────────────────────────────────────────────────────────

export function writeRun(result: RunResult, outputDir: string): string {
  const runSetDir = path.join(outputDir, result.runSetId);
  fs.mkdirSync(runSetDir, { recursive: true });

  const filePath = path.join(runSetDir, `run-${result.attemptNumber}.json`);
  fs.writeFileSync(filePath, JSON.stringify(result, null, 2), "utf-8");
  return filePath;
}

export function writeSummary(
  results: RunResult[],
  outputDir: string,
  runSetId: string,
): string {
  if (results.length === 0) {
    throw new Error("Cannot write summary: no results provided");
  }

  const first = results[0]!;
  const summary: RunSetSummary = {
    runSetId,
    ...(first.variantName !== undefined
      ? { variantName: first.variantName }
      : {}),
    variantName: first.variantName,
    agentName: first.agentName,
    agentVersion: first.agentVersion,
    agentConfig: first.agentConfig,
    totalRuns: results.length,
    completedAt: new Date().toISOString(),
    metrics: {
      timeMs: computeStat(results.map((r) => r.metrics.timeMs)),
      lineCount: computeStat(results.map((r) => r.metrics.lineCount)),
      tokenCount: computeStat(results.map((r) => r.metrics.tokenCount)),
      estimatedCostUsd: results.some((r) => r.metrics.estimatedCostUsd != null)
        ? computeStat(
            results
              .map((r) => r.metrics.estimatedCostUsd)
              .filter((v): v is number => v != null),
          )
        : null,
    },
    scoring: {
      overall: results.some((r) => r.scoring.overall != null)
        ? computeStat(
            results
              .map((r) => r.scoring.overall)
              .filter((s): s is number => s != null),
          )
        : null,
      llmJudge: results.some((r) => r.scoring.llmJudge != null)
        ? computeStat(
            results
              .map((r) => r.scoring.llmJudge?.score)
              .filter((s): s is number => s != null),
          )
        : null,
      checks: results.some(
        (r) => r.scoring.checks != null && r.scoring.checks.length > 0,
      )
        ? computeStat(
            results
              .map((r) => {
                const c = r.scoring.checks;
                if (!c || c.length === 0) return null;
                return c.reduce((sum, x) => sum + x.score, 0) / c.length;
              })
              .filter((s): s is number => s != null),
          )
        : null,
    },
    runIds: results.map((r) => r.runId),
  };

  const runSetDir = path.join(outputDir, runSetId);
  fs.mkdirSync(runSetDir, { recursive: true });

  const filePath = path.join(runSetDir, "summary.json");
  fs.writeFileSync(filePath, JSON.stringify(summary, null, 2), "utf-8");
  return filePath;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export function readRun(filePath: string): RunResult {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as RunResult;
}

export function readSummary(
  runSetId: string,
  outputDir: string,
): RunSetSummary {
  const filePath = path.join(outputDir, runSetId, "summary.json");
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Summary not found for run set "${runSetId}". Did you run \`bench run\` first?`,
    );
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as RunSetSummary;
}

export function listRunSets(outputDir: string): string[] {
  if (!fs.existsSync(outputDir)) return [];
  const ids: string[] = [];
  for (const variantEntry of fs.readdirSync(outputDir, {
    withFileTypes: true,
  })) {
    if (!variantEntry.isDirectory()) continue;
    const variantDir = path.join(outputDir, variantEntry.name);
    for (const runEntry of fs.readdirSync(variantDir, {
      withFileTypes: true,
    })) {
      if (!runEntry.isDirectory()) continue;
      const summaryPath = path.join(variantDir, runEntry.name, "summary.json");
      if (fs.existsSync(summaryPath)) {
        ids.push(`${variantEntry.name}/${runEntry.name}`);
      }
    }
  }
  return ids.sort().reverse(); // newest first
}

/**
 * Checks if a sufficient number of runs already exist for a given
 * (agentName, agentVersion) combination.
 * Returns the matching summary if found, undefined otherwise.
 */
export function findCompletedRuns(
  variantName: string,
  minRuns: number,
  outputDir: string,
): RunSetSummary | undefined {
  for (const id of listRunSets(outputDir)) {
    try {
      const summary = readSummary(id, outputDir);
      if (summary.variantName === variantName && summary.totalRuns >= minRuns) {
        return summary;
      }
    } catch {
      // skip unreadable
    }
  }
  return undefined;
}

export function listRunFiles(runSetId: string, outputDir: string): string[] {
  const runSetDir = path.join(outputDir, runSetId);
  if (!fs.existsSync(runSetDir)) return [];
  return fs
    .readdirSync(runSetDir)
    .filter((f) => f.startsWith("run-") && f.endsWith(".json"))
    .map((f) => path.join(runSetDir, f))
    .sort();
}

/**
 * Writes agent stdout and stderr as separate log files for diagnostics.
 * Placed at runs/{runSetId}/run-{N}-stdout.log and run-{N}-stderr.log.
 */
export function writeAgentLogs(
  runSetId: string,
  attemptNumber: number,
  stdout: string,
  stderr: string,
  outputDir: string,
): void {
  const runSetDir = path.join(outputDir, runSetId);
  fs.mkdirSync(runSetDir, { recursive: true });

  fs.writeFileSync(
    path.join(runSetDir, `run-${attemptNumber}-stdout.log`),
    stdout,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(runSetDir, `run-${attemptNumber}-stderr.log`),
    stderr,
    "utf-8",
  );
}

/**
 * Copies all workspace files (excluding .git) into
 * runs/{runSetId}/run-{N}-workspace/ for human inspection.
 */
export function saveWorkspaceFiles(
  runSetId: string,
  attemptNumber: number,
  workspacePath: string,
  outputDir: string,
): void {
  const dest = path.join(outputDir, runSetId, `run-${attemptNumber}-workspace`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(workspacePath, dest);
}

/**
 * Writes a human-readable judge summary file for a run.
 * Placed at runs/{runSetId}/run-{N}-judge.md.
 */
export function writeJudgeNotes(
  runSetId: string,
  attemptNumber: number,
  result: RunResult,
  outputDir: string,
): void {
  const judge = result.scoring.llmJudge;
  if (!judge) return;

  const lines: string[] = [
    `# Judge Notes — Run ${attemptNumber}`,
    "",
    `**Variant:** ${result.variantName}  `,
    `**Agent:** ${result.agentName}  `,
    `**Score:** ${judge.score.toFixed(3)}  `,
    `**Model:** ${judge.provider} / ${judge.model}`,
    "",
    "## Summary",
    "",
    judge.summary || judge.reasoning,
    "",
    "## Per-Criterion Scores",
    "",
    ...judge.criteria.map(
      (c) => `- **${c.criterion}** — ${c.score.toFixed(2)}: ${c.reasoning}`,
    ),
    "",
    "## Detailed Reasoning",
    "",
    judge.reasoning,
  ];

  const filePath = path.join(
    outputDir,
    runSetId,
    `run-${attemptNumber}-judge.md`,
  );
  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
}

/** Patches a specific run-N.json in place (used by `bench review`). */
export function patchRun(
  runSetId: string,
  attemptNumber: number,
  outputDir: string,
  patch: Partial<RunResult>,
): void {
  const filePath = path.join(outputDir, runSetId, `run-${attemptNumber}.json`);
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
