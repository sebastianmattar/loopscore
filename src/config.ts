import fs from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type {
  AgentConfig,
  BenchConfig,
  VariantConfig,
  VariantDefaults,
} from "./types";

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
  name: z.string(),
  cmd: z.string(),
  args: z.array(z.string()).optional(),
  model: z.string().optional(),
  model_params: z.record(z.string(), z.unknown()).optional(),
  costPerMillionTokens: z.number().optional(),
});

const VariantDefaultsSchema = z.object({
  agent: z.string().optional(),
  cmd: z.string().optional(),
  args: z.array(z.string()).optional(),
  model: z.string().optional(),
  model_params: z.record(z.string(), z.unknown()).optional(),
  setup: SetupConfigSchema.optional(),
  costPerMillionTokens: z.number().optional(),
  commands: CommandsConfigSchema.optional(),
  query: z.array(z.string()).optional(),
  acceptanceCriteria: z.array(z.string()).optional(),
  checks: z.array(CheckConfigSchema).optional(),
});

const VariantConfigSchema = z.object({
  name: z.string(),
  agent: z.string().optional(),
  cmd: z.string().optional(),
  args: z.array(z.string()).optional(),
  model: z.string().optional(),
  model_params: z.record(z.string(), z.unknown()).optional(),
  setup: SetupConfigSchema.optional(),
  costPerMillionTokens: z.number().optional(),
  commands: CommandsConfigSchema.optional(),
  query: z.array(z.string()).optional(),
  acceptanceCriteria: z.array(z.string()).optional(),
  checks: z.array(CheckConfigSchema).optional(),
});

const JudgeConfigSchema = z.object({
  provider: z.enum(["copilot"]).default("copilot"),
  model: z.string().optional(),
});

export const BenchConfigSchema = z.object({
  agents: z.array(z.union([AgentConfigSchema, z.string()])).default([]),
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

  // Only keep inline agent objects (string name-references are no longer supported)
  const inlineAgents = (
    parsed.agents as (z.infer<typeof AgentConfigSchema> | string)[]
  ).filter(
    (a): a is z.infer<typeof AgentConfigSchema> => typeof a === "object",
  );

  return {
    ...parsed,
    name: benchName,
    agents: inlineAgents,
    // Embed bench name into outputDir: <configured_dir>/<benchName>
    outputDir: path.resolve(configDir, parsed.outputDir, benchName),
  };
}

/**
 * Merges a variant's overrides into the base agent config for that variant,
 * producing the effective AgentConfig to use when running the variant.
 *
 * Resolution order (later wins):
 *   base agent config (or built-in defaults) → variantDefaults → variant's own settings
 */
export function resolveVariantAgentConfig(
  variant: VariantConfig,
  agents: AgentConfig[],
  defaults?: VariantDefaults,
): AgentConfig {
  const agentName = variant.agent ?? defaults?.agent;
  if (!agentName) {
    throw new Error(
      `Variant "${variant.name}": no agent specified and no variantDefaults.agent set.`,
    );
  }

  // Use explicit agent config if defined; otherwise fall back to built-in adapter
  // (cmd defaults to the agent name, args left unset so the adapter uses its defaults)
  const base: AgentConfig = agents.find((a) => a.name === agentName) ?? {
    name: agentName,
    cmd: agentName,
  };

  // Apply defaults on top of base, then variant's own settings on top
  const effectiveCmd = variant.cmd ?? defaults?.cmd ?? base.cmd;
  const effectiveArgs = variant.args ?? defaults?.args ?? base.args;
  const effectiveModel = variant.model ?? defaults?.model ?? base.model;
  const effectiveCost =
    variant.costPerMillionTokens ??
    defaults?.costPerMillionTokens ??
    base.costPerMillionTokens;
  const effectiveModelParams = {
    ...base.model_params,
    ...defaults?.model_params,
    ...variant.model_params,
  };

  return {
    ...base,
    cmd: effectiveCmd,
    ...(effectiveArgs !== undefined ? { args: effectiveArgs } : {}),
    ...(effectiveModel !== undefined ? { model: effectiveModel } : {}),
    ...(effectiveCost !== undefined
      ? { costPerMillionTokens: effectiveCost }
      : {}),
    model_params:
      Object.keys(effectiveModelParams).length > 0
        ? effectiveModelParams
        : base.model_params,
  };
}
