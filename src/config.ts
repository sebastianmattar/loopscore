import fs from "fs";
import path from "path";
import stripJsonComments from "strip-json-comments";
import { z } from "zod";
import type {
  AgentConfig,
  BenchConfig,
  VariantConfig,
  VariantDefaults,
} from "./types";

const SetupConfigSchema = z.object({
  skillsDir: z.string().optional(),
  agentsMd: z.string().optional(),
  mcpJson: z.string().optional(),
});

const CommandsConfigSchema = z.object({
  before: z.array(z.string()).optional(),
  after: z.array(z.string()).optional(),
});

const AgentConfigSchema = z.object({
  name: z.string(),
  cmd: z.string(),
  args: z.array(z.string()).optional(),
  model: z.string().optional(),
  model_params: z.record(z.string(), z.unknown()).optional(),
  setup: SetupConfigSchema.optional(),
  costPerMillionTokens: z.number().optional(),
  commands: CommandsConfigSchema.optional(),
});

const VariantDefaultsSchema = z.object({
  agent: z.string().optional(),
  task: z.string().optional(),
  cmd: z.string().optional(),
  args: z.array(z.string()).optional(),
  model: z.string().optional(),
  model_params: z.record(z.string(), z.unknown()).optional(),
  setup: SetupConfigSchema.optional(),
  costPerMillionTokens: z.number().optional(),
  commands: CommandsConfigSchema.optional(),
});

const VariantConfigSchema = z.object({
  name: z.string(),
  agent: z.string().optional(),
  task: z.string().optional(),
  cmd: z.string().optional(),
  args: z.array(z.string()).optional(),
  model: z.string().optional(),
  model_params: z.record(z.string(), z.unknown()).optional(),
  setup: SetupConfigSchema.optional(),
  costPerMillionTokens: z.number().optional(),
  commands: CommandsConfigSchema.optional(),
});

const JudgeConfigSchema = z.object({
  provider: z.enum(["copilot", "openai", "anthropic"]).default("copilot"),
  model: z.string().optional(),
  apiKey: z.string().optional(),
});

const BenchConfigSchema = z.object({
  agents: z.array(z.union([AgentConfigSchema, z.string()])).default([]),
  variantDefaults: VariantDefaultsSchema.optional(),
  variants: z.array(VariantConfigSchema).optional(),
  defaultRuns: z.number().int().min(1).default(3),
  parallel: z.boolean().default(true),
  runsDir: z.string().default("./runs"),
  tasksDir: z.string().default("./tasks"),
  judge: JudgeConfigSchema.optional(),
});

const DEFAULT_CONFIG: BenchConfig = {
  agents: [],
  defaultRuns: 3,
  parallel: true,
  runsDir: "./runs",
  tasksDir: "./tasks",
};

export function loadConfig(configPath?: string): BenchConfig {
  const resolvedPath = configPath
    ? path.resolve(configPath)
    : path.resolve(process.cwd(), "bench.config.json");

  if (!fs.existsSync(resolvedPath)) {
    return DEFAULT_CONFIG;
  }

  const raw = JSON.parse(
    stripJsonComments(fs.readFileSync(resolvedPath, "utf-8")),
  );
  const parsed = BenchConfigSchema.parse(raw);

  // Resolve relative paths relative to the config file directory
  const configDir = path.dirname(resolvedPath);

  // Only keep inline agent objects (string name-references are no longer supported)
  const inlineAgents = (
    parsed.agents as (z.infer<typeof AgentConfigSchema> | string)[]
  ).filter(
    (a): a is z.infer<typeof AgentConfigSchema> => typeof a === "object",
  );

  return {
    ...parsed,
    agents: inlineAgents,
    runsDir: path.resolve(configDir, parsed.runsDir),
    tasksDir: path.resolve(configDir, parsed.tasksDir),
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
  const effectiveSetup = {
    ...base.setup,
    ...defaults?.setup,
    ...variant.setup,
  };
  const effectiveCommands = {
    ...base.commands,
    ...defaults?.commands,
    ...variant.commands,
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
    setup: Object.keys(effectiveSetup).length > 0 ? effectiveSetup : base.setup,
    ...(Object.keys(effectiveCommands).length > 0
      ? { commands: effectiveCommands }
      : {}),
  };
}
