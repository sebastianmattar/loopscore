import chalk from "chalk";
import { Command } from "commander";
import fs from "fs";
import ora from "ora";
import path from "path";
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
): Promise<string | null> {
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
      return null;
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
  return runSetId;
}

/** Run one agent on one task with plain log output (parallel mode). */
async function runAgentParallel(
  variant: VariantConfig,
  agentConfig: AgentConfig,
  runs: number,
  config: ReturnType<typeof loadConfig>,
  force: boolean,
  variantName: string,
): Promise<string | null> {
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
  return runSetId;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

export function buildCLI(): Command {
  const program = new Command()
    .name("loopscore")
    .description("Benchmark agentic coding AIs against coding tasks")
    .version("0.1.0");
  // ── bench run-all ──────────────────────────────────────────────────────────
  program
    .command("run")
    .description("Run a benchmark")
    .argument("config", "Path to config file (e.g. mybench.config.yaml)")
    .option(
      "-f, --force",
      "Run even if enough runs already exist for this configuration",
    )
    .action(
      async (
        configFile,
        opts: {
          force?: boolean;
        },
      ) => {
        const config = loadConfig(configFile as string);
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

        const runVariant = async (
          variant: (typeof config.variants)[0],
        ): Promise<string | null> => {
          const agentConfig = resolveVariantAgentConfig(
            variant,
            config.agents,
            config.variantDefaults,
          );

          if (parallel) {
            return runAgentParallel(
              variant,
              agentConfig,
              runs,
              config,
              force,
              variant.name,
            );
          } else {
            console.log(chalk.bold(`\n  Variant "${variant.name}"`));
            return runAgentWithSpinner(
              variant,
              agentConfig,
              runs,
              config,
              force,
              "    ",
            );
          }
        };

        let runSetIds: (string | null)[];
        if (parallel) {
          const results = await Promise.allSettled(
            config.variants.map(runVariant),
          );
          runSetIds = results.map((r) =>
            r.status === "fulfilled" ? r.value : null,
          );
        } else {
          runSetIds = [];
          for (const variant of config.variants) {
            runSetIds.push(await runVariant(variant));
          }
        }

        // Write summary.md with ALL historical run sets (not just current run)
        const allIds = listRunSets(config.outputDir);
        if (allIds.length > 0) {
          const summaries = allIds.map((id) =>
            readSummary(id, config.outputDir),
          );
          const md = formatScoreboardMarkdown(summaries);
          const summaryFile = path.join(config.outputDir, "summary.md");
          fs.writeFileSync(summaryFile, md, "utf-8");
          console.log(chalk.gray(`\n  Summary written: ${summaryFile}`));
        }
      },
    );

  // ── bench report ──────────────────────────────────────────────────────────
  program
    .command("report")
    .argument("config", "Path to config file (e.g. mybench.config.yaml)")
    .description(
      "Show metrics and scores for a run set, or all run sets with --all",
    )
    .action((configFile) => {
      const config = loadConfig(configFile as string);

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
    .argument("config", "Path to config file (e.g. mybench.config.yaml)")
    .option("-m, --markdown", "Output as Markdown instead of a terminal table")
    .action((configFile, opts: { markdown?: boolean }) => {
      const config = loadConfig(configFile as string);
      const ids = listRunSets(config.outputDir);
      const summaries = ids.map((id) => readSummary(id, config.outputDir));
      console.log(
        opts.markdown
          ? formatScoreboardMarkdown(summaries)
          : formatScoreboard(summaries),
      );
    });

  return program;
}
