import chalk from "chalk";
import { Command } from "commander";
import readline from "readline";
import { loadConfig } from "./config";
import {
  listRunFiles,
  listRunSets,
  patchRun,
  readRun,
  readSummary,
  writeSummary,
} from "./persistence";
import { formatCompare, formatReport, formatScoreboard } from "./report";
import { runTask } from "./runner";
import { applyManualScore } from "./scorers/manual";
import { findTask, loadTasks } from "./tasks";
import type { RunResult } from "./types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveAgentConfig(
  agentName: string | undefined,
  config: ReturnType<typeof loadConfig>,
) {
  if (agentName) {
    const found = config.agents.find((a) => a.name === agentName);
    if (!found) {
      console.error(
        chalk.red(
          `Agent "${agentName}" not found in config. Available: ${config.agents.map((a) => a.name).join(", ")}`,
        ),
      );
      process.exit(1);
    }
    return [found];
  }
  if (config.agents.length === 0) {
    console.error(
      chalk.red("No agents configured. Add agents to bench.config.json."),
    );
    process.exit(1);
  }
  return config.agents;
}

function makeRunSetId(taskId: string, agentName: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${ts}-${taskId}-${agentName}`;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

export function buildCLI(): Command {
  const program = new Command()
    .name("loopscore")
    .description("Benchmark agentic coding AIs against coding tasks")
    .version("0.1.0");

  // ── bench run ──────────────────────────────────────────────────────────────
  program
    .command("run <task-id>")
    .description("Run a single task with one or all configured agents")
    .option("-a, --agent <name>", "Agent name (default: all configured agents)")
    .option("-n, --runs <number>", "Number of runs per agent")
    .option("-c, --config <path>", "Path to bench.config.json")
    .action(
      async (
        taskId: string,
        opts: { agent?: string; runs?: string; config?: string },
      ) => {
        const config = loadConfig(opts.config);
        const task = findTask(config.tasksDir, taskId);
        const agents = resolveAgentConfig(opts.agent, config);
        const runs = opts.runs
          ? Math.max(1, parseInt(opts.runs, 10))
          : config.defaultRuns;

        for (const agentConfig of agents) {
          const runSetId = makeRunSetId(task.id, agentConfig.name);
          console.log(
            chalk.bold(
              `\nRunning task "${task.id}" with agent "${agentConfig.name}" (${runs} run${runs > 1 ? "s" : ""})…`,
            ),
          );

          const results = await runTask(
            task,
            agentConfig,
            config,
            runs,
            runSetId,
            (attempt, total, result) => {
              const score =
                result.scoring.overall != null
                  ? chalk.green(` score=${result.scoring.overall.toFixed(2)}`)
                  : "";
              console.log(
                `  [${attempt}/${total}] done in ${result.metrics.timeMs}ms,` +
                  ` +${result.metrics.lineCount} lines${score}`,
              );
            },
          );

          const summaryPath = writeSummary(results, config.runsDir, runSetId);
          console.log(chalk.gray(`  Saved: ${summaryPath}`));
          console.log(`  Run set ID: ${chalk.cyan(runSetId)}`);
        }
      },
    );

  // ── bench run-all ──────────────────────────────────────────────────────────
  program
    .command("run-all")
    .description("Run all tasks in the tasks directory")
    .option("-a, --agent <name>", "Agent name (default: all configured agents)")
    .option("-n, --runs <number>", "Number of runs per agent per task")
    .option("-c, --config <path>", "Path to bench.config.json")
    .action(async (opts: { agent?: string; runs?: string; config?: string }) => {
      const config = loadConfig(opts.config);
      const tasks = loadTasks(config.tasksDir);
      const agents = resolveAgentConfig(opts.agent, config);
      const runs = opts.runs
        ? Math.max(1, parseInt(opts.runs, 10))
        : config.defaultRuns;

      console.log(
        chalk.bold(
          `\nRunning ${tasks.length} task(s) with ${agents.length} agent(s), ${runs} run(s) each…`,
        ),
      );

      for (const task of tasks) {
        for (const agentConfig of agents) {
          const runSetId = makeRunSetId(task.id, agentConfig.name);
          console.log(
            chalk.bold(`\n  Task "${task.id}" / Agent "${agentConfig.name}"`),
          );

          const results = await runTask(
            task,
            agentConfig,
            config,
            runs,
            runSetId,
            (attempt, total, result) => {
              const score =
                result.scoring.overall != null
                  ? chalk.green(` score=${result.scoring.overall.toFixed(2)}`)
                  : "";
              console.log(
                `    [${attempt}/${total}] ${result.metrics.timeMs}ms +${result.metrics.lineCount} lines${score}`,
              );
            },
          );

          writeSummary(results, config.runsDir, runSetId);
          console.log(chalk.gray(`    Run set: ${runSetId}`));
        }
      }
    });

  // ── bench report ──────────────────────────────────────────────────────────
  program
    .command("report [run-set-id]")
    .description(
      "Show metrics and scores for a run set, or all run sets with --all",
    )
    .option("-a, --all", "Show reports for all run sets")
    .option("-c, --config <path>", "Path to bench.config.json")
    .action(
      (
        runSetId: string | undefined,
        opts: { all?: boolean; config?: string },
      ) => {
        const config = loadConfig(opts.config);
        if (opts.all) {
          const ids = listRunSets(config.runsDir);
          if (ids.length === 0) {
            console.log(chalk.gray("No run sets found."));
            return;
          }
          for (const id of ids) {
            const summary = readSummary(id, config.runsDir);
            console.log(formatReport(summary));
          }
          return;
        }
        if (!runSetId) {
          console.error(chalk.red("Provide a <run-set-id> or use --all."));
          process.exit(1);
        }
        const summary = readSummary(runSetId, config.runsDir);
        console.log(formatReport(summary));
      },
    );

  // ── bench compare ─────────────────────────────────────────────────────────
  program
    .command("compare <run-set-ids...>")
    .description("Side-by-side comparison of multiple run sets")
    .option("-c, --config <path>", "Path to bench.config.json")
    .action((runSetIds: string[], opts: { config?: string }) => {
      const config = loadConfig(opts.config);
      const summaries = runSetIds.map((id) => readSummary(id, config.runsDir));
      console.log(formatCompare(summaries));
    });

  // ── bench scoreboard ──────────────────────────────────────────────────────
  program
    .command("scoreboard")
    .description("Show a ranked overview of all run sets")
    .option("-c, --config <path>", "Path to bench.config.json")
    .action((opts: { config?: string }) => {
      const config = loadConfig(opts.config);
      const ids = listRunSets(config.runsDir);
      const summaries = ids.map((id) => readSummary(id, config.runsDir));
      console.log(formatScoreboard(summaries));
    });

  // ── bench list ────────────────────────────────────────────────────────────
  const listCmd = program.command("list").description("List runs or tasks");

  listCmd
    .command("runs")
    .description("List all run sets")
    .option("-c, --config <path>", "Path to bench.config.json")
    .action((opts: { config?: string }) => {
      const config = loadConfig(opts.config);
      const runSets = listRunSets(config.runsDir);
      if (runSets.length === 0) {
        console.log(chalk.gray("No run sets found."));
        return;
      }
      console.log(chalk.bold(`\nRun sets in ${config.runsDir}:\n`));
      for (const id of runSets) {
        console.log(`  ${chalk.cyan(id)}`);
      }
      console.log("");
    });

  listCmd
    .command("tasks")
    .description("List all available tasks")
    .option("-c, --config <path>", "Path to bench.config.json")
    .action((opts: { config?: string }) => {
      const config = loadConfig(opts.config);
      const tasks = loadTasks(config.tasksDir);
      if (tasks.length === 0) {
        console.log(chalk.gray("No tasks found."));
        return;
      }
      console.log(chalk.bold(`\nTasks in ${config.tasksDir}:\n`));
      for (const task of tasks) {
        console.log(
          `  ${chalk.cyan(task.id)}  ${task.title}  ` +
            chalk.gray(`(${task.acceptance_criteria.length} criteria)`),
        );
      }
      console.log("");
    });

  // ── bench review ──────────────────────────────────────────────────────────
  program
    .command("review <run-set-id>")
    .description(
      "Enter manual scores for runs in a run set that are pending review",
    )
    .option("-c, --config <path>", "Path to bench.config.json")
    .action(async (runSetId: string, opts: { config?: string }) => {
      const config = loadConfig(opts.config);
      const files = listRunFiles(runSetId, config.runsDir);

      if (files.length === 0) {
        console.error(
          chalk.red(`No run files found for run set "${runSetId}".`),
        );
        process.exit(1);
      }

      const pending = files
        .map((f) => readRun(f))
        .filter((r) => r.scoring.manual?.pending === true);

      if (pending.length === 0) {
        console.log(chalk.green("No pending manual reviews for this run set."));
        return;
      }

      console.log(chalk.bold(`\nManual review for run set: ${runSetId}`));
      console.log(`${pending.length} run(s) pending review.\n`);

      for (const run of pending) {
        await reviewRun(run, runSetId, config.runsDir);
      }

      console.log(chalk.green("\nReview complete."));
    });

  return program;
}

async function reviewRun(
  run: RunResult,
  runSetId: string,
  runsDir: string,
): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, resolve));

  console.log(
    chalk.bold(`\nRun ${run.attemptNumber} — ${run.taskId} (${run.agentName})`),
  );
  console.log(chalk.gray(`  Workspace: ${run.workspacePath}`));

  const scoreStr = await ask("  Score (0.0–1.0): ");
  const score = parseFloat(scoreStr);
  if (isNaN(score) || score < 0 || score > 1) {
    console.log(chalk.yellow("  Invalid score; skipping this run."));
    rl.close();
    return;
  }

  const notes = await ask("  Notes (optional): ");
  rl.close();

  const updatedManual = applyManualScore(score, notes);
  const updatedScoring = {
    ...run.scoring,
    manual: updatedManual,
    overall: recomputeOverall(run, score),
  };

  patchRun(runSetId, run.attemptNumber, runsDir, { scoring: updatedScoring });
  console.log(
    chalk.green(`  Saved score ${score} for run ${run.attemptNumber}.`),
  );
}

function recomputeOverall(run: RunResult, manualScore: number): number {
  const scores: number[] = [manualScore];
  if (run.scoring.llmJudge) scores.push(run.scoring.llmJudge.score);
  if (run.scoring.tests) scores.push(run.scoring.tests.score);
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}
