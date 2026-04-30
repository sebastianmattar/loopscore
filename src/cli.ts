import chalk from "chalk";
import { Command } from "commander";
import fs from "fs";
import ora from "ora";
import path from "path";
import { getAdapter } from "./agents/index";
import { loadConfig } from "./config";
import {
  findCompletedRuns,
  listRunFiles,
  listRunSets,
  readRun,
  readSummary,
  writeSummary,
} from "./persistence";
import {
  formatReport,
  formatRunDetailsMarkdown,
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

function copyMissingScaffold(sourcePath: string, destPath: string): boolean {
  if (!fs.existsSync(sourcePath)) return false;

  const sourceStat = fs.statSync(sourcePath);

  if (sourceStat.isDirectory()) {
    fs.mkdirSync(destPath, { recursive: true });
    let wroteAny = false;
    for (const entry of fs.readdirSync(sourcePath)) {
      wroteAny =
        copyMissingScaffold(
          path.join(sourcePath, entry),
          path.join(destPath, entry),
        ) || wroteAny;
    }
    return wroteAny;
  }

  if (fs.existsSync(destPath)) return false;

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(sourcePath, destPath);
  return true;
}

async function runHealthchecks(agentConfigs: AgentConfig[]): Promise<void> {
  console.log(chalk.bold("\nRunning healthchecks…"));
  for (const agentConfig of agentConfigs) {
    const adapter = getAdapter(agentConfig.type);
    try {
      await adapter.healthcheck(agentConfig);
      console.log(chalk.green(`  ✓ ${agentConfig.type}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`  ✗ ${agentConfig.type}: ${msg}`));
      process.exit(1);
    }
  }
}

/** Run one agent on one task, with an ora spinner (sequential mode). */
async function runAgentWithSpinner(
  variant: VariantConfig,
  runs: number,
  config: ReturnType<typeof loadConfig>,
  force: boolean,
  prefixText: string,
): Promise<string | null> {
  if (!force) {
    const existing = findCompletedRuns(
      variant.name,
      runs,
      config.options!.outputDir,
    );
    if (existing) {
      console.log(
        chalk.yellow(
          `\n  Skipping "${variant.name}" — ` +
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

  const summaryPath = writeSummary(
    results,
    config.options!.outputDir,
    runSetId,
  );
  console.log(chalk.gray(`  Saved: ${summaryPath}`));
  console.log(`  Run set ID: ${chalk.cyan(runSetId)}`);
  return runSetId;
}

/** Run one agent on one task with plain log output (parallel mode). */
async function runAgentParallel(
  variant: VariantConfig,
  runs: number,
  config: ReturnType<typeof loadConfig>,
  force: boolean,
  variantName: string,
): Promise<string | null> {
  if (!force) {
    const existing = findCompletedRuns(
      variant.name,
      runs,
      config.options!.outputDir,
    );
    if (existing) {
      console.log(
        chalk.yellow(
          `  Skipping "${variant.name}" — ` +
            `already have ${existing.totalRuns} run(s) in ${existing.runSetId}. Use --force to override.`,
        ),
      );
      return null;
    }
  }

  const runSetId = makeRunSetId(variantName);
  const startedAt = Date.now();
  console.log(chalk.bold(`  ▶ ${variantName} starting…`));

  const results = await runTask(
    variant,
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
        chalk.green(`  ✓ ${variantName}`) +
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
      console.log(chalk.gray(`  ⚖ ${variantName} judging…`));
    },
  );

  const totalElapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const summaryPath = writeSummary(
    results,
    config.options!.outputDir,
    runSetId,
  );
  console.log(
    chalk.gray(
      `    ${variantName} finished in ${totalElapsed}s — saved: ${summaryPath}`,
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
        configFile: string,
        opts: {
          force?: boolean;
        },
      ) => {
        const config = loadConfig(configFile);
        const runs = config.options!.runCount;
        const force = opts.force ?? false;

        await runHealthchecks(
          config.variants
            .map((v) => v.agent)
            .filter((a): a is AgentConfig => a?.type !== undefined),
        );

        const parallel = config.options!.parallel;
        console.log(
          chalk.bold(
            `\nRunning ${config.variants.length} variant(s), ${runs} run(s) each${parallel ? " (parallel)" : ""}…`,
          ),
        );

        const runVariant = async (
          variant: (typeof config.variants)[0],
        ): Promise<string | null> => {
          if (parallel) {
            return runAgentParallel(variant, runs, config, force, variant.name);
          } else {
            console.log(chalk.bold(`\n  Variant "${variant.name}"`));
            return runAgentWithSpinner(variant, runs, config, force, "    ");
          }
        };

        if (parallel) {
          const settled = await Promise.allSettled(
            config.variants.map(runVariant),
          );
          for (const r of settled) {
            if (r.status === "rejected") {
              console.error(
                chalk.red(
                  `  ✗ variant failed: ${(r.reason as Error).message ?? r.reason}`,
                ),
              );
            }
          }
        } else {
          for (const variant of config.variants) {
            await runVariant(variant);
          }
        }

        // Write summary.md with ALL historical run sets (not just current run)
        const allIds = listRunSets(config.options!.outputDir);
        if (allIds.length > 0) {
          const summaries = allIds.map((id) =>
            readSummary(id, config.options!.outputDir),
          );
          const runsByVariant = new Map<
            string,
            import("./types").RunResult[]
          >();
          for (const id of allIds) {
            for (const filePath of listRunFiles(
              id,
              config.options!.outputDir,
            )) {
              const run = readRun(filePath);
              const group = runsByVariant.get(run.variantName) ?? [];
              group.push(run);
              runsByVariant.set(run.variantName, group);
            }
          }
          const md =
            formatScoreboardMarkdown(summaries, config.description) +
            "\n" +
            formatRunDetailsMarkdown(runsByVariant);
          const summaryFile = path.join(
            config.options!.outputDir,
            "summary.md",
          );
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

      const ids = listRunSets(config.options!.outputDir);
      if (ids.length === 0) {
        console.log(chalk.gray("No run sets found."));
        return;
      }
      for (const id of ids) {
        const summary = readSummary(id, config.options!.outputDir);
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
      const ids = listRunSets(config.options!.outputDir);
      const summaries = ids.map((id) =>
        readSummary(id, config.options!.outputDir),
      );
      console.log(
        opts.markdown
          ? formatScoreboardMarkdown(summaries, config.description)
          : formatScoreboard(summaries),
      );
    });

  // ── init ──────────────────────────────────────────────────────────────────
  program
    .command("init")
    .description(
      "Set up VS Code settings, benchmark schema, skills, and example benchmark files in the current directory",
    )
    .action(() => {
      const cwd = process.cwd();
      const vscodeDir = path.join(cwd, ".vscode");
      fs.mkdirSync(vscodeDir, { recursive: true });
      const packageRoot = path.resolve(
        import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
        "..",
      );

      // ── Copy schema ──────────────────────────────────────────────────────
      const schemaSource = path.join(packageRoot, "bench-config.schema.json");
      const schemaDest = path.join(cwd, "bench-config.schema.json");
      fs.copyFileSync(schemaSource, schemaDest);
      console.log(chalk.green(`  ✓ Written: ${schemaDest}`));

      // ── Copy skills scaffolding ─────────────────────────────────────────
      const skillsSource = path.join(packageRoot, ".github", "skills");
      const skillsDest = path.join(cwd, ".github", "skills");
      if (copyMissingScaffold(skillsSource, skillsDest)) {
        console.log(chalk.green(`  ✓ Scaffolded: ${skillsDest}`));
      } else {
        console.log(chalk.gray(`  – Already present: ${skillsDest}`));
      }

      // ── Copy example benchmark ──────────────────────────────────────────
      const exampleSource = path.join(
        packageRoot,
        "benchmarks",
        "caveman-skill.config.yaml",
      );
      const exampleDest = path.join(
        cwd,
        "benchmarks",
        "caveman-skill.config.yaml",
      );
      if (copyMissingScaffold(exampleSource, exampleDest)) {
        console.log(chalk.green(`  ✓ Scaffolded: ${exampleDest}`));
      } else {
        console.log(chalk.gray(`  – Already present: ${exampleDest}`));
      }

      // ── extensions.json ──────────────────────────────────────────────────
      const extFile = path.join(vscodeDir, "extensions.json");
      const recommendedExt = "redhat.vscode-yaml";
      let extJson: { recommendations?: string[] } = {};
      if (fs.existsSync(extFile)) {
        try {
          extJson = JSON.parse(fs.readFileSync(extFile, "utf-8")) as {
            recommendations?: string[];
          };
        } catch {
          // malformed – start fresh
        }
      }
      const recs = extJson.recommendations ?? [];
      if (!recs.includes(recommendedExt)) {
        recs.push(recommendedExt);
        extJson.recommendations = recs;
        fs.writeFileSync(
          extFile,
          JSON.stringify(extJson, null, 2) + "\n",
          "utf-8",
        );
        console.log(chalk.green(`  ✓ Updated: ${extFile}`));
      } else {
        console.log(chalk.gray(`  – Already present: ${extFile}`));
      }

      // ── settings.json ────────────────────────────────────────────────────
      const settingsFile = path.join(vscodeDir, "settings.json");
      let settingsJson: Record<string, unknown> = {};
      if (fs.existsSync(settingsFile)) {
        try {
          settingsJson = JSON.parse(
            fs.readFileSync(settingsFile, "utf-8"),
          ) as Record<string, unknown>;
        } catch {
          // malformed – start fresh
        }
      }
      const yamlSchemas = (settingsJson["yaml.schemas"] ?? {}) as Record<
        string,
        unknown
      >;
      const schemaKey = "./bench-config.schema.json";
      const schemaGlobs = ["*.config.yaml", "benchmarks/*.config.yaml"];
      const existing = yamlSchemas[schemaKey];
      const alreadySet = Array.isArray(existing)
        ? schemaGlobs.every((glob) => existing.includes(glob))
        : schemaGlobs.includes(existing as string);
      if (!alreadySet) {
        const mergedGlobs = Array.isArray(existing)
          ? Array.from(new Set([...existing, ...schemaGlobs]))
          : typeof existing === "string"
            ? Array.from(new Set([existing, ...schemaGlobs]))
            : schemaGlobs;
        yamlSchemas[schemaKey] = mergedGlobs;
        settingsJson["yaml.schemas"] = yamlSchemas;
        fs.writeFileSync(
          settingsFile,
          JSON.stringify(settingsJson, null, 2) + "\n",
          "utf-8",
        );
        console.log(chalk.green(`  ✓ Updated: ${settingsFile}`));
      } else {
        console.log(chalk.gray(`  – Already present: ${settingsFile}`));
      }

      console.log(
        chalk.bold(
          "\n  Done. Open the folder in VS Code to get YAML autocomplete plus starter skills and benchmark files.",
        ),
      );
    });

  return program;
}
