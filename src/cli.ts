import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import readline from "readline";
import { getAgentVersion } from "./agents/base.js";
import { getAdapter } from "./agents/index.js";
import { loadConfig } from "./config.js";
import {
  findCompletedRuns,
  listRunFiles,
  listRunSets,
  patchRun,
  readRun,
  readSummary,
  writeSummary,
} from "./persistence.js";
import {
  formatCompare,
  formatReport,
  formatScoreboard,
  formatScoreboardMarkdown,
} from "./report.js";
import { runTask } from "./runner/index.js";
import { applyManualScore } from "./scorers/manual.js";
import { findTask, loadTasks } from "./tasks.js";
import type { AgentConfig, RunResult } from "./types.js";

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

async function runHealthchecks(agents: AgentConfig[]): Promise<void> {
  console.log(chalk.bold("\nRunning healthchecks…"));
  for (const agentConfig of agents) {
    const adapter = getAdapter(agentConfig);
    try {
      await adapter.healthcheck(agentConfig);
      console.log(chalk.green(`  ✓ ${agentConfig.name}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`  ✗ ${agentConfig.name}: ${msg}`));
      process.exit(1);
    }
  }
}

// ── CLI ───────────────────────────────────────────────────────────────────────

export function buildCLI(): Command {
  const program = new Command()
    .name("loopscore")
    .description("Benchmark agentic coding AIs against coding tasks")
    .version("0.1.0")
    .option(
      "-c, --config <path>",
      "Path to config file (default: bench.config.json)",
    );

  // ── bench run ──────────────────────────────────────────────────────────────
  program
    .command("run <task-id>")
    .description("Run a single task with one or all configured agents")
    .option("-a, --agent <name>", "Agent name (default: all configured agents)")
    .option("-n, --runs <number>", "Number of runs per agent")
    .option(
      "-f, --force",
      "Run even if enough runs already exist for this configuration",
    )
    .action(
      async (
        taskId: string,
        opts: { agent?: string; runs?: string; force?: boolean },
      ) => {
        const config = loadConfig(program.opts().config as string | undefined);
        const task = findTask(config.tasksDir, taskId);
        const agents = resolveAgentConfig(opts.agent, config);
        const runs = opts.runs
          ? Math.max(1, parseInt(opts.runs, 10))
          : config.defaultRuns;

        await runHealthchecks(agents);

        for (const agentConfig of agents) {
          const agentVersion = getAgentVersion(agentConfig);
          if (!opts.force) {
            const existing = findCompletedRuns(
              task.id,
              agentConfig.name,
              agentVersion,
              runs,
              config.runsDir,
            );
            if (existing) {
              console.log(
                chalk.yellow(
                  `\n  Skipping "${task.id}" / "${agentConfig.name}" ${agentVersion} — ` +
                    `already have ${existing.totalRuns} run(s) in ${existing.runSetId}. Use --force to override.`,
                ),
              );
              continue;
            }
          }
          const runSetId = makeRunSetId(task.id, agentConfig.name);
          console.log(
            chalk.bold(
              `\nRunning task "${task.id}" with agent "${agentConfig.name}" (${runs} run${runs > 1 ? "s" : ""})…`,
            ),
          );

          const spinner = ora({ prefixText: " " }).start(
            `[1/${runs}] running…`,
          );
          let startedAt = Date.now();
          let ticker = setInterval(() => {
            const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
            spinner.text = `[1/${runs}] running… ${elapsed}s`;
          }, 1000);

          const results = await runTask(
            task,
            agentConfig,
            config,
            runs,
            runSetId,
            (attempt, total, result) => {
              clearInterval(ticker);
              const score =
                result.scoring.overall != null
                  ? chalk.green(` score=${result.scoring.overall.toFixed(2)}`)
                  : "";
              spinner.stopAndPersist({
                symbol: chalk.green("✓"),
                text: `[${attempt}/${total}] done in ${result.metrics.timeMs}ms, +${result.metrics.lineCount} lines${score}`,
              });
              if (attempt < total) {
                spinner.start(`[${attempt + 1}/${total}] running…`);
              }
            },
            (attempt, total) => {
              if (attempt > 1) {
                spinner.start(`[${attempt}/${total}] running…`);
                startedAt = Date.now();
                ticker = setInterval(() => {
                  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
                  spinner.text = `[${attempt}/${total}] running… ${elapsed}s`;
                }, 1000);
              }
            },
          );
          clearInterval(ticker);
          spinner.stop();

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
    .option(
      "-f, --force",
      "Run even if enough runs already exist for this configuration",
    )
    .action(
      async (opts: { agent?: string; runs?: string; force?: boolean }) => {
        const config = loadConfig(program.opts().config as string | undefined);
        const tasks = loadTasks(config.tasksDir);
        const agents = resolveAgentConfig(opts.agent, config);
        const runs = opts.runs
          ? Math.max(1, parseInt(opts.runs, 10))
          : config.defaultRuns;

        await runHealthchecks(agents);

        console.log(
          chalk.bold(
            `\nRunning ${tasks.length} task(s) with ${agents.length} agent(s), ${runs} run(s) each…`,
          ),
        );

        for (const task of tasks) {
          for (const agentConfig of agents) {
            const agentVersion = getAgentVersion(agentConfig);
            if (!opts.force) {
              const existing = findCompletedRuns(
                task.id,
                agentConfig.name,
                agentVersion,
                runs,
                config.runsDir,
              );
              if (existing) {
                console.log(
                  chalk.yellow(
                    `\n  Skipping "${task.id}" / "${agentConfig.name}" ${agentVersion} — ` +
                      `already have ${existing.totalRuns} run(s) in ${existing.runSetId}. Use --force to override.`,
                  ),
                );
                continue;
              }
            }
            const runSetId = makeRunSetId(task.id, agentConfig.name);
            console.log(
              chalk.bold(`\n  Task "${task.id}" / Agent "${agentConfig.name}"`),
            );

            const spinner = ora({ prefixText: "    " }).start(
              `[1/${runs}] running…`,
            );
            let startedAt = Date.now();
            let ticker = setInterval(() => {
              const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
              spinner.text = `[1/${runs}] running… ${elapsed}s`;
            }, 1000);

            const results = await runTask(
              task,
              agentConfig,
              config,
              runs,
              runSetId,
              (attempt, total, result) => {
                clearInterval(ticker);
                const score =
                  result.scoring.overall != null
                    ? chalk.green(` score=${result.scoring.overall.toFixed(2)}`)
                    : "";
                spinner.stopAndPersist({
                  symbol: chalk.green("✓"),
                  text: `[${attempt}/${total}] ${result.metrics.timeMs}ms +${result.metrics.lineCount} lines${score}`,
                });
                if (attempt < total) {
                  spinner.start(`[${attempt + 1}/${total}] running…`);
                }
              },
              (attempt, total) => {
                if (attempt > 1) {
                  spinner.start(`[${attempt}/${total}] running…`);
                  startedAt = Date.now();
                  ticker = setInterval(() => {
                    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
                    spinner.text = `[${attempt}/${total}] running… ${elapsed}s`;
                  }, 1000);
                }
              },
            );
            clearInterval(ticker);
            spinner.stop();

            writeSummary(results, config.runsDir, runSetId);
            console.log(chalk.gray(`    Run set: ${runSetId}`));
          }
        }
      },
    );

  // ── bench report ──────────────────────────────────────────────────────────
  program
    .command("report [run-set-id]")
    .description(
      "Show metrics and scores for a run set, or all run sets with --all",
    )
    .option("-a, --all", "Show reports for all run sets")
    .action((runSetId: string | undefined, opts: { all?: boolean }) => {
      const config = loadConfig(program.opts().config as string | undefined);
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
    });

  // ── bench compare ─────────────────────────────────────────────────────────
  program
    .command("compare <run-set-ids...>")
    .description("Side-by-side comparison of multiple run sets")
    .action((runSetIds: string[]) => {
      const config = loadConfig(program.opts().config as string | undefined);
      const summaries = runSetIds.map((id) => readSummary(id, config.runsDir));
      console.log(formatCompare(summaries));
    });

  // ── bench scoreboard ──────────────────────────────────────────────────────
  program
    .command("scoreboard")
    .description("Show a ranked overview of all run sets")
    .option("-m, --markdown", "Output as Markdown instead of a terminal table")
    .action((opts: { markdown?: boolean }) => {
      const config = loadConfig(program.opts().config as string | undefined);
      const ids = listRunSets(config.runsDir);
      const summaries = ids.map((id) => readSummary(id, config.runsDir));
      console.log(
        opts.markdown
          ? formatScoreboardMarkdown(summaries)
          : formatScoreboard(summaries),
      );
    });

  // ── bench list ────────────────────────────────────────────────────────────
  const listCmd = program.command("list").description("List runs or tasks");

  listCmd
    .command("runs")
    .description("List all run sets")
    .action(() => {
      const config = loadConfig(program.opts().config as string | undefined);
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
    .action(() => {
      const config = loadConfig(program.opts().config as string | undefined);
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
    .action(async (runSetId: string) => {
      const config = loadConfig(program.opts().config as string | undefined);
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
