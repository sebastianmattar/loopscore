import chalk from "chalk";
import Table from "cli-table3";
import type { RunResult, RunSetSummary, StatSummary } from "./types";

// ── Single run-set report ─────────────────────────────────────────────────────

export function formatReport(summary: RunSetSummary): string {
  const lines: string[] = [];

  lines.push(
    chalk.bold(`\n  Run Set: ${summary.runSetId}`),
    `  Variant:    ${summary.variantName}`,
    `  Agent:   ${summary.agentName}`,
    `  Runs:    ${summary.totalRuns}`,
    `  At:      ${summary.completedAt}`,
    "",
  );

  const table = new Table({
    head: [
      chalk.cyan("Metric"),
      chalk.cyan("Mean"),
      chalk.cyan("Min"),
      chalk.cyan("Max"),
      chalk.cyan("StdDev"),
    ],
    style: { head: [], border: [] },
  });

  table.push(
    metricRow("Time (ms)", summary.metrics.timeMs, (v) => `${v}`),
    metricRow("Lines added", summary.metrics.lineCount, (v) => `${v}`),
    metricRow("Est. tokens", summary.metrics.tokenCount, (v) => `${v}`),
  );

  if (summary.metrics.estimatedCostUsd) {
    table.push(
      metricRow(
        "Est. cost (USD)",
        summary.metrics.estimatedCostUsd,
        (v) => `$${v.toFixed(4)}`,
      ),
    );
  } else {
    table.push(["Est. cost (USD)", chalk.gray("—"), "", "", ""]);
  }

  if (summary.scoring.overall) {
    table.push(
      metricRow("Score (0–1)", summary.scoring.overall, (v) =>
        chalk.green(v.toFixed(3)),
      ),
    );
  } else {
    table.push(["Score (0–1)", chalk.gray("—"), "", "", ""]);
  }

  lines.push(table.toString(), "");
  return lines.join("\n");
}

// ── Side-by-side comparison ───────────────────────────────────────────────────

export function formatCompare(summaries: RunSetSummary[]): string {
  if (summaries.length === 0) return "";

  const lines: string[] = [chalk.bold("\n  Comparison\n")];

  const table = new Table({
    head: [
      chalk.cyan("Metric"),
      ...summaries.map((s) => chalk.cyan(`${s.agentName}\n${s.variantName}`)),
    ],
    style: { head: [], border: [] },
  });

  const rows: Array<{ label: string; stat: (s: RunSetSummary) => string }> = [
    {
      label: "Time (ms)",
      stat: (s) => formatMean(s.metrics.timeMs),
    },
    {
      label: "Lines added",
      stat: (s) => formatMean(s.metrics.lineCount),
    },
    {
      label: "Est. tokens",
      stat: (s) => formatMean(s.metrics.tokenCount),
    },
    {
      label: "Est. cost (USD)",
      stat: (s) =>
        s.metrics.estimatedCostUsd
          ? `$${s.metrics.estimatedCostUsd.mean.toFixed(4)}`
          : chalk.gray("—"),
    },
    {
      label: "Score (0–1)",
      stat: (s) =>
        s.scoring.overall
          ? chalk.green(s.scoring.overall.mean.toFixed(3))
          : chalk.gray("—"),
    },
    { label: "Runs", stat: (s) => `${s.totalRuns}` },
  ];

  for (const row of rows) {
    table.push([row.label, ...summaries.map(row.stat)]);
  }

  lines.push(table.toString(), "");
  return lines.join("\n");
}

// ── Scoreboard ────────────────────────────────────────────────────────────────

export function formatScoreboard(summaries: RunSetSummary[]): string {
  if (summaries.length === 0) {
    return chalk.gray("\n  No run sets found.\n");
  }

  const lines: string[] = [chalk.bold("\n  Scoreboard\n")];

  const table = new Table({
    head: [
      chalk.cyan("Variant"),
      chalk.cyan("Agent"),
      chalk.cyan("Overall"),
      chalk.cyan("LLM Judge"),
      chalk.cyan("Checks"),
      chalk.cyan("Time (ms)"),
      chalk.cyan("Lines"),
      chalk.cyan("Est. cost"),
      chalk.cyan("Runs"),
      chalk.cyan("Run Set"),
    ],
    style: { head: [], border: [] },
  });

  // Sort by score descending (nulls last)
  const sorted = [...summaries].sort((a, b) => {
    const sa = a.scoring.overall?.mean ?? -1;
    const sb = b.scoring.overall?.mean ?? -1;
    return sb - sa;
  });

  for (const s of sorted) {
    const score = s.scoring.overall
      ? chalk.green(s.scoring.overall.mean.toFixed(3))
      : chalk.gray("—");
    const llmJudge = s.scoring.llmJudge
      ? chalk.green(s.scoring.llmJudge.mean.toFixed(3))
      : chalk.gray("—");
    const checks = s.scoring.checks
      ? chalk.green(s.scoring.checks.mean.toFixed(3))
      : chalk.gray("—");
    const cost = s.metrics.estimatedCostUsd
      ? `$${s.metrics.estimatedCostUsd.mean.toFixed(4)}`
      : chalk.gray("—");
    table.push([
      s.variantName,
      s.agentName,
      score,
      llmJudge,
      checks,
      formatMean(s.metrics.timeMs),
      formatMean(s.metrics.lineCount),
      cost,
      `${s.totalRuns}`,
      chalk.gray(s.runSetId),
    ]);
  }

  lines.push(table.toString(), "");
  return lines.join("\n");
}

// ── Scoreboard (Markdown) ─────────────────────────────────────────────────────

export function formatScoreboardMarkdown(
  summaries: RunSetSummary[],
  description?: string,
): string {
  if (summaries.length === 0) {
    return "_No run sets found._\n";
  }

  const sorted = [...summaries].sort((a, b) => {
    const sa = a.scoring.overall?.mean ?? -1;
    const sb = b.scoring.overall?.mean ?? -1;
    return sb - sa;
  });

  const rows = sorted.map((s) => {
    const score = s.scoring.overall ? s.scoring.overall.mean.toFixed(3) : "—";
    const llmJudge = s.scoring.llmJudge
      ? s.scoring.llmJudge.mean.toFixed(3)
      : "—";
    const checks = s.scoring.checks ? s.scoring.checks.mean.toFixed(3) : "—";
    const cost = s.metrics.estimatedCostUsd
      ? `$${s.metrics.estimatedCostUsd.mean.toFixed(4)}`
      : "—";
    const time = formatMean(s.metrics.timeMs);
    const lines = formatMean(s.metrics.lineCount);
    return `| ${s.agentName} | ${s.variantName} | ${score} | ${llmJudge} | ${checks} | ${time} | ${lines} | ${cost} | ${s.totalRuns} |`;
  });

  const lines: string[] = [];

  if (description) {
    lines.push(`# ${description}`, "");
  }

  lines.push(
    "## Scoreboard",
    "",
    "| Agent | Variant | Overall | LLM Judge | Checks | Time (ms) | Lines | Est. cost | Runs |",
    "|-------|---------|--------:|----------:|-------:|----------:|------:|-----------|-----:|",
    ...rows,
    "",
  );

  return lines.join("\n");
}

// ── Detailed run info by variant (Markdown) ───────────────────────────────────

export function formatRunDetailsMarkdown(
  runsByVariant: Map<string, RunResult[]>,
): string {
  if (runsByVariant.size === 0) return "";

  const lines: string[] = ["## Details by Variant", ""];

  for (const [variantName, runs] of runsByVariant) {
    lines.push(`### ${variantName}`, "");

    // Group runs by runSetId
    const byRunSet = new Map<string, RunResult[]>();
    for (const run of runs) {
      const group = byRunSet.get(run.runSetId) ?? [];
      group.push(run);
      byRunSet.set(run.runSetId, group);
    }

    for (const [runSetId, setRuns] of byRunSet) {
      lines.push(`#### Run Set: \`${runSetId}\``, "");

      const sortedRuns = [...setRuns].sort(
        (a, b) => a.attemptNumber - b.attemptNumber,
      );

      for (const run of sortedRuns) {
        const score =
          run.scoring.overall != null ? run.scoring.overall.toFixed(3) : "—";
        const cost =
          run.metrics.estimatedCostUsd != null
            ? `$${run.metrics.estimatedCostUsd.toFixed(4)}`
            : "—";
        lines.push(
          `**Run ${run.attemptNumber}** — ${run.completedAt} · ${run.metrics.timeMs}ms · ${run.metrics.lineCount} lines · score: ${score}`,
          "",
          "| Metric | Value |",
          "|--------|------:|",
          `| Time | ${run.metrics.timeMs}ms |`,
          `| Lines | ${run.metrics.lineCount} |`,
          `| Tokens | ${run.metrics.tokenCount} |`,
          `| Est. cost | ${cost} |`,
          `| Exit code | ${run.exitCode ?? "—"} |`,
          "",
        );

        if (run.scoring.llmJudge) {
          const judge = run.scoring.llmJudge;
          lines.push(
            `**LLM Judge** (score: ${judge.score.toFixed(3)}): ${judge.summary}`,
            "",
          );
          if (judge.criteria.length > 0) {
            lines.push(
              "| Criterion | Score | Reasoning |",
              "|-----------|------:|-----------|",
            );
            for (const c of judge.criteria) {
              const reasoning = c.reasoning.replace(/\|/g, "\\|");
              lines.push(
                `| ${c.criterion} | ${c.score.toFixed(2)} | ${reasoning} |`,
              );
            }
            lines.push("");
          }
        }

        if (run.scoring.checks && run.scoring.checks.length > 0) {
          lines.push(
            "**Checks:**",
            "",
            "| Check | Score | Passed |",
            "|-------|------:|:------:|",
          );
          for (const c of run.scoring.checks) {
            lines.push(`| ${c.name} | ${c.score} | ${c.success ? "✓" : "✗"} |`);
          }
          lines.push("");
        }
      }
    }
  }

  return lines.join("\n");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function metricRow(
  label: string,
  stat: StatSummary,
  fmt: (v: number) => string,
): string[] {
  return [
    label,
    fmt(stat.mean),
    fmt(stat.min),
    fmt(stat.max),
    `±${stat.stddev}`,
  ];
}

function formatMean(stat: StatSummary): string {
  return stat.mean % 1 === 0 ? `${stat.mean}` : stat.mean.toFixed(2);
}
