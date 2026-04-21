import fs from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { BenchConfig } from "./types";

const CommandsConfigSchema = z.object({
  before: z.array(z.string()).optional(),
  after: z.array(z.string()).optional(),
});

const SetupConfigSchema = z.object({
  files: z.record(z.string(), z.string()).optional(),
  commands: CommandsConfigSchema.optional(),
});

const AgentConfigSchema = z.object({
  type: z.string(),
  cmd: z.string().optional(),
  args: z.array(z.string()).optional(),
  model: z.string().optional(),
  model_params: z.record(z.string(), z.unknown()).optional(),
  costPerMillionTokens: z.number().optional(),
});

const VariantConfigSchema = z.object({
  name: z.string(),
  agent: AgentConfigSchema.partial().optional(),
  setup: SetupConfigSchema.optional(),
  commands: CommandsConfigSchema.optional(),
  query: z.array(z.string()).optional(),
});

const VariantDefaultsSchema = VariantConfigSchema.omit({ name: true });

const MeasurementsSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("judge"),
    provider: z.enum(["copilot"]).default("copilot"),
    model: z.string().optional(),
    acceptanceCriteria: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal("shell"),
    name: z.string(),
    command: z.string(),
    scoreIfPasses: z.number(),
    scoreIfFails: z.number(),
  }),
]);

const RunOptionsSchema = z.object({
  runCount: z.number().int().min(1).default(3),
  parallel: z.boolean().default(true),
  outputDir: z.string().default("./results"),
});

export const BenchConfigSchema = z.object({
  options: RunOptionsSchema.optional(),
  variantDefaults: VariantDefaultsSchema.optional(),
  variants: z.array(VariantConfigSchema),
  measure: z.array(MeasurementsSchema),
});

export function loadConfig(configPath: string): BenchConfig {
  // Probe for YAML first, then fall back to JSON
  const resolvedPath = path.resolve(configPath);

  if (!fs.existsSync(resolvedPath)) {
    throw Error(`Could not find configration in ${resolvedPath}`);
  }

  const text = fs.readFileSync(resolvedPath, "utf-8");
  const ext = path.extname(resolvedPath).toLowerCase();
  const raw =
    ext === ".yaml" || ext === ".yml" ? parseYaml(text) : JSON.parse(text);
  const parsed = BenchConfigSchema.parse(raw);

  // Resolve relative paths relative to the config file directory
  const configDir = path.dirname(resolvedPath);

  // Derive benchmark name from config filename: "bench.config.yaml" → "bench"
  const benchName = path.basename(resolvedPath).split(".")[0] ?? "bench";

  return {
    ...parsed,
    name: benchName,
    options: {
      runCount: parsed.options?.runCount ?? 3,
      parallel: parsed.options?.parallel ?? true,
      // Embed bench name into outputDir: <configured_dir>/<benchName>
      outputDir: path.resolve(
        configDir,
        parsed.options?.outputDir ?? "./results",
        benchName,
      ),
    },
  };
}
