import fs from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { BenchConfig } from "./types";

const CommandsConfigSchema = z.object({
  before: z.array(z.string()).optional(),
  after: z.array(z.string()).optional(),
});

const CheckConfigSchema = z.object({
  name: z.string(),
  command: z.string(),
  scoreIfPasses: z.number(),
  scoreIfFails: z.number(),
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
  acceptanceCriteria: z.array(z.string()).optional(),
  checks: z.array(CheckConfigSchema).optional(),
});

const VariantDefaultsSchema = VariantConfigSchema.omit({ name: true });

const JudgeConfigSchema = z.object({
  provider: z.enum(["copilot"]).default("copilot"),
  model: z.string().optional(),
});

export const BenchConfigSchema = z.object({
  variantDefaults: VariantDefaultsSchema.optional(),
  variants: z.array(VariantConfigSchema),
  acceptanceCriteria: z.array(z.string()),
  checks: z.array(CheckConfigSchema).optional(),
  runCount: z.number().int().min(1).default(3),
  parallel: z.boolean().default(true),
  outputDir: z.string().default("./results"),
  judge: JudgeConfigSchema,
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
    // Embed bench name into outputDir: <configured_dir>/<benchName>
    outputDir: path.resolve(configDir, parsed.outputDir, benchName),
  };
}
