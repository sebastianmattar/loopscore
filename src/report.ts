import chalk from "chalk";
import Table from "cli-table3";
import type { RunSetSummary, StatSummary } from "./types";

// ── Single run-set report ─────────────────────────────────────────────────────

export function formatReport(summary: RunSetSummary): string {
  const lines: string[] = [];

  lines.push(
    chalk.bold(`\n  Run Set: ${summary.runSetId}`),
    `  Task:    ${summary.taskId}`,
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
      ...summaries.map((s) => chalk.cyan(`${s.agentName}\n${s.taskId}`)),
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
