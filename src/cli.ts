import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import { getAgentVersion } from "./agents/base.js";
import { getAdapter } from "./agents/index.js";
import { loadConfig, resolveVariantAgentConfig } from "./config.js";
import {
  findCompletedRuns,
  listRunSets,
  readSummary,
  writeSummary,
} from "./persistence.js";
import {
  formatReport,
  formatScoreboard,
  formatScoreboardMarkdown,
} from "./report.js";
import { runTask } from "./runner/index.js";
import { findTask, loadTasks } from "./tasks.js";
import type { AgentConfig, Task } from "./types.js";

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

function makeRunSetId(variantName: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${ts}-${variantName}`;
}

function makeRunSetIdLegacy(taskId: string, agentName: string): string {
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

/** Run one agent on one task, with an ora spinner (sequential mode). */
async function runAgentWithSpinner(
  task: Task,
  agentConfig: AgentConfig,
  runs: number,
  config: ReturnType<typeof loadConfig>,
  force: boolean,
  prefixText: string,
  variantName?: string,
): Promise<void> {
  const agentVersion = getAgentVersion(agentConfig);
  if (!force) {
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
          `\n  Skipping "${variantName ?? task.id}" / "${agentConfig.name}" ${agentVersion} — ` +
            `already have ${existing.totalRuns} run(s) in ${existing.runSetId}. Use --force to override.`,
        ),
      );
      return;
    }
  }
  const runSetId = variantName
    ? makeRunSetId(variantName)
    : makeRunSetIdLegacy(task.id, agentConfig.name);

  const spinner = ora({ prefixText }).start(`[1/${runs}] running…`);
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
    variantName,
  );
  clearInterval(ticker);
  spinner.stop();

  const summaryPath = writeSummary(results, config.runsDir, runSetId);
  console.log(chalk.gray(`  Saved: ${summaryPath}`));
  console.log(`  Run set ID: ${chalk.cyan(runSetId)}`);
}

/** Run one agent on one task with plain log output (parallel mode). */
async function runAgentParallel(
  task: Task,
  agentConfig: AgentConfig,
  runs: number,
  config: ReturnType<typeof loadConfig>,
  force: boolean,
  variantName?: string,
): Promise<void> {
  const agentVersion = getAgentVersion(agentConfig);
  const label = variantName
    ? `"${variantName}"`
    : `"${task.id}" / "${agentConfig.name}"`;
  if (!force) {
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
          `  Skipping ${label} ${agentVersion} — already have ${existing.totalRuns} run(s). Use --force to override.`,
        ),
      );
      return;
    }
  }
  const runSetId = variantName
    ? makeRunSetId(variantName)
    : makeRunSetIdLegacy(task.id, agentConfig.name);

  const startedAt = Date.now();
  console.log(chalk.bold(`  ▶ ${label} starting…`));

  const results = await runTask(
    task,
    agentConfig,
    config,
    runs,
    runSetId,
    (attempt, total, result) => {
      const m = result.metrics;
      const elapsed = (m.timeMs / 1000).toFixed(1);
      const tokens = m.tokenCount > 0 ? ` tokens=${m.tokenCount}` : "";
      const cost =
        m.estimatedCostUsd != null
          ? chalk.gray(` cost=$${m.estimatedCostUsd.toFixed(4)}`)
          : "";
      const score =
        result.scoring.overall != null
          ? chalk.green(` score=${result.scoring.overall.toFixed(2)}`)
          : "";
      console.log(
        chalk.green(`  ✓ ${label}`) +
          ` [${attempt}/${total}]` +
          ` time=${elapsed}s` +
          ` lines=${m.lineCount}` +
          tokens +
          cost +
          score,
      );
    },
    undefined,
    variantName,
  );

  const totalElapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const summaryPath = writeSummary(results, config.runsDir, runSetId);
  console.log(
    chalk.gray(
      `    ${label} finished in ${totalElapsed}s — saved: ${summaryPath}`,
    ),
  );
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

  // ── bench run-all ──────────────────────────────────────────────────────────
  program
    .command("run-all")
    .description("Run all variants")
    .option(
      "-a, --agent <name>",
      "Agent name (only used in task mode, no variants)",
    )
    .option("-n, --runs <number>", "Number of runs per agent per task")
    .option(
      "-f, --force",
      "Run even if enough runs already exist for this configuration",
    )
    .action(
      async (opts: { agent?: string; runs?: string; force?: boolean }) => {
        const config = loadConfig(program.opts().config as string | undefined);
        const runs = opts.runs
          ? Math.max(1, parseInt(opts.runs, 10))
          : config.defaultRuns;
        const force = opts.force ?? false;

        if (config.variants && config.variants.length > 0) {
          // Variant mode — resolve agent configs and deduplicate for healthchecks
          const allVariantConfigs = config.variants.map((v) =>
            resolveVariantAgentConfig(v, config.agents, config.variantDefaults),
          );
          const seenNames = new Set<string>();
          const uniqueAgentConfigs = allVariantConfigs.filter((a) => {
            if (seenNames.has(a.name)) return false;
            seenNames.add(a.name);
            return true;
          });
          await runHealthchecks(uniqueAgentConfigs);

          const parallel = config.parallel && config.variants.length > 1;
          console.log(
            chalk.bold(
              `\nRunning ${config.variants.length} variant(s), ${runs} run(s) each${parallel ? " (parallel)" : ""}…`,
            ),
          );

          const runVariant = async (variant: (typeof config.variants)[0]) => {
            const agentConfig = resolveVariantAgentConfig(
              variant,
              config.agents,
              config.variantDefaults,
            );
            const taskId = variant.task ?? config.variantDefaults?.task;
            if (!taskId)
              throw new Error(`Variant "${variant.name}": no task specified.`);
            const task = findTask(config.tasksDir, taskId);
            if (parallel) {
              await runAgentParallel(
                task,
                agentConfig,
                runs,
                config,
                force,
                variant.name,
              );
            } else {
              console.log(chalk.bold(`\n  Variant "${variant.name}"`));
              await runAgentWithSpinner(
                task,
                agentConfig,
                runs,
                config,
                force,
                "    ",
                variant.name,
              );
            }
          };

          if (parallel) {
            await Promise.allSettled(config.variants.map(runVariant));
          } else {
            for (const variant of config.variants) {
              await runVariant(variant);
            }
          }
        } else {
          // Legacy task mode
          const tasks = loadTasks(config.tasksDir);
          const agents = resolveAgentConfig(opts.agent, config);
          await runHealthchecks(agents);

          const combos = tasks.flatMap((task) =>
            agents.map((agent) => ({ task, agent })),
          );
          const parallel = config.parallel && combos.length > 1;

          console.log(
            chalk.bold(
              `\nRunning ${tasks.length} task(s) with ${agents.length} agent(s), ${runs} run(s) each${parallel ? " (parallel)" : ""}…`,
            ),
          );

          if (parallel) {
            await Promise.allSettled(
              combos.map(({ task, agent }) =>
                runAgentParallel(task, agent, runs, config, force),
              ),
            );
          } else {
            for (const { task, agent } of combos) {
              console.log(
                chalk.bold(`\n  Task "${task.id}" / Agent "${agent.name}"`),
              );
              await runAgentWithSpinner(
                task,
                agent,
                runs,
                config,
                force,
                "    ",
              );
            }
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
    .command("variants")
    .description("List all variants defined in the config")
    .action(() => {
      const config = loadConfig(program.opts().config as string | undefined);
      if (!config.variants || config.variants.length === 0) {
        console.log(chalk.gray("No variants configured."));
        return;
      }
      console.log(chalk.bold(`\nVariants:\n`));
      for (const v of config.variants) {
        const overrides: string[] = [];
        if (v.model) overrides.push(`model=${v.model}`);
        if (v.model_params && Object.keys(v.model_params).length > 0)
          overrides.push(`params=${JSON.stringify(v.model_params)}`);
        if (v.setup && Object.keys(v.setup).length > 0)
          overrides.push(`setup=${JSON.stringify(v.setup)}`);
        const extras =
          overrides.length > 0 ? chalk.gray(`  ${overrides.join("  ")}`) : "";
        console.log(
          `  ${chalk.cyan(v.name)}  agent=${v.agent ?? config.variantDefaults?.agent ?? "?"}  task=${v.task ?? config.variantDefaults?.task ?? "?"}${extras}`,
        );
      }
      console.log("");
    });

  return program;
}
