import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import { getAgentVersion } from "./agents/base";
import { getAdapter } from "./agents/index";
import { loadConfig, resolveVariantAgentConfig } from "./config";
import {
  findCompletedRuns,
  listRunSets,
  readSummary,
  writeSummary,
} from "./persistence";
import {
  formatReport,
  formatScoreboard,
  formatScoreboardMarkdown,
} from "./report";
import { runTask } from "./runner/index";
import type { AgentConfig, VariantConfig } from "./types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRunSetId(variantName: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${variantName}/${ts}`;
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
  variant: VariantConfig,
  agentConfig: AgentConfig,
  runs: number,
  config: ReturnType<typeof loadConfig>,
  force: boolean,
  prefixText: string,
): Promise<void> {
  const agentVersion = getAgentVersion(agentConfig);
  if (!force) {
    const existing = findCompletedRuns(
      variant.name,
      agentConfig.name,
      agentVersion,
      runs,
      config.outputDir,
    );
    if (existing) {
      console.log(
        chalk.yellow(
          `\n  Skipping "${variant.name}" / "${agentConfig.name}" ${agentVersion} — ` +
            `already have ${existing.totalRuns} run(s) in ${existing.runSetId}. Use --force to override.`,
        ),
      );
      return;
    }
  }
  const runSetId = makeRunSetId(variant.name);
  const label = chalk.cyan(variant.name);

  const spinner = ora({ prefixText }).start(`${label} [1/${runs}] running…`);
  let startedAt = Date.now();
  let ticker = setInterval(() => {
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
    spinner.text = `${label} [1/${runs}] running… ${elapsed}s`;
  }, 1000);

  const results = await runTask(
    variant,
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
        text: `${label} [${attempt}/${total}] done in ${result.metrics.timeMs}ms, +${result.metrics.lineCount} lines${score}`,
      });
      if (attempt < total) {
        spinner.start(`${label} [${attempt + 1}/${total}] running…`);
      }
    },
    (attempt, total) => {
      if (attempt > 1) {
        spinner.start(`${label} [${attempt}/${total}] running…`);
        startedAt = Date.now();
        ticker = setInterval(() => {
          const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
          spinner.text = `${label} [${attempt}/${total}] running… ${elapsed}s`;
        }, 1000);
      }
    },
    variant.name,
    () => {
      clearInterval(ticker);
      spinner.text = `${label} judging…`;
    },
  );
  clearInterval(ticker);
  spinner.stop();

  const summaryPath = writeSummary(results, config.outputDir, runSetId);
  console.log(chalk.gray(`  Saved: ${summaryPath}`));
  console.log(`  Run set ID: ${chalk.cyan(runSetId)}`);
}

/** Run one agent on one task with plain log output (parallel mode). */
async function runAgentParallel(
  variant: VariantConfig,
  agentConfig: AgentConfig,
  runs: number,
  config: ReturnType<typeof loadConfig>,
  force: boolean,
  variantName: string,
): Promise<void> {
  const label = variantName;

  const runSetId = makeRunSetId(variantName);
  const startedAt = Date.now();
  console.log(chalk.bold(`  ▶ ${label} starting…`));

  const results = await runTask(
    variant,
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
    () => {
      console.log(chalk.gray(`  ⚖ ${label} judging…`));
    },
  );

  const totalElapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const summaryPath = writeSummary(results, config.outputDir, runSetId);
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
    .requiredOption(
      "-c, --config <path>",
      "Path to config file (e.g. mybench.config.yaml)",
    );

  // ── bench run-all ──────────────────────────────────────────────────────────
  program
    .command("run")
    .description("Run a benchmark")
    .option(
      "-f, --force",
      "Run even if enough runs already exist for this configuration",
    )
    .action(
      async (opts: { agent?: string; runs?: string; force?: boolean }) => {
        const config = loadConfig(program.opts().config as string);
        const runs = config.runCount ?? 3;
        const force = opts.force ?? false;

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

        const parallel = config.parallel ?? true;
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

          if (parallel) {
            await runAgentParallel(
              variant,
              agentConfig,
              runs,
              config,
              force,
              variant.name,
            );
          } else {
            console.log(chalk.bold(`\n  Variant "${variant.name}"`));
            await runAgentWithSpinner(
              variant,
              agentConfig,
              runs,
              config,
              force,
              "    ",
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
      },
    );

  // ── bench report ──────────────────────────────────────────────────────────
  program
    .command("report")
    .description(
      "Show metrics and scores for a run set, or all run sets with --all",
    )
    .action(() => {
      const config = loadConfig(program.opts().config as string);

      const ids = listRunSets(config.outputDir);
      if (ids.length === 0) {
        console.log(chalk.gray("No run sets found."));
        return;
      }
      for (const id of ids) {
        const summary = readSummary(id, config.outputDir);
        console.log(formatReport(summary));
      }
    });

  // ── bench scoreboard ──────────────────────────────────────────────────────
  program
    .command("scoreboard")
    .description("Show a ranked overview of all run sets")
    .option("-m, --markdown", "Output as Markdown instead of a terminal table")
    .action((opts: { markdown?: boolean }) => {
      const config = loadConfig(program.opts().config as string);
      const ids = listRunSets(config.outputDir);
      const summaries = ids.map((id) => readSummary(id, config.outputDir));
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
      const config = loadConfig(program.opts().config as string);
      const runSets = listRunSets(config.outputDir);
      if (runSets.length === 0) {
        console.log(chalk.gray("No run sets found."));
        return;
      }
      console.log(chalk.bold(`\nRun sets in ${config.outputDir}:\n`));
      for (const id of runSets) {
        console.log(`  ${chalk.cyan(id)}`);
      }
      console.log("");
    });

  listCmd
    .command("variants")
    .description("List all variants defined in the config")
    .action(() => {
      const config = loadConfig(program.opts().config as string);
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
          `  ${chalk.cyan(v.name)}  agent=${v.agent ?? config.variantDefaults?.agent ?? "?"} ${extras}`,
        );
      }
      console.log("");
    });

  return program;
}
