import fs from "fs";
import path from "path";
import { z } from "zod";
import type {
  AgentConfig,
  BenchConfig,
  VariantConfig,
  VariantDefaults,
} from "./types.js";

const SetupConfigSchema = z.object({
  skillsDir: z.string().optional(),
  agentsMd: z.string().optional(),
  mcpJson: z.string().optional(),
});

const AgentConfigSchema = z.object({
  name: z.string(),
  cmd: z.string(),
  args: z.array(z.string()).optional(),
  model: z.string().optional(),
  model_params: z.record(z.string(), z.unknown()).optional(),
  setup: SetupConfigSchema.optional(),
  costPerMillionTokens: z.number().optional(),
});

const VariantDefaultsSchema = z.object({
  agent: z.string().optional(),
  task: z.string().optional(),
  model: z.string().optional(),
  model_params: z.record(z.string(), z.unknown()).optional(),
  setup: SetupConfigSchema.optional(),
});

const VariantConfigSchema = z.object({
  name: z.string(),
  agent: z.string().optional(),
  task: z.string().optional(),
  model: z.string().optional(),
  model_params: z.record(z.string(), z.unknown()).optional(),
  setup: SetupConfigSchema.optional(),
});

const JudgeConfigSchema = z.object({
  provider: z.enum(["copilot", "openai", "anthropic"]).default("copilot"),
  model: z.string().optional(),
  apiKey: z.string().optional(),
});

const BenchConfigSchema = z.object({
  agents: z.array(z.union([AgentConfigSchema, z.string()])).default([]),
  agentsDir: z.string().optional(),
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

  const raw = JSON.parse(fs.readFileSync(resolvedPath, "utf-8"));
  const parsed = BenchConfigSchema.parse(raw);

  // Resolve relative paths relative to the config file directory
  const configDir = path.dirname(resolvedPath);
  const resolvedAgentsDir = parsed.agentsDir
    ? path.resolve(configDir, parsed.agentsDir)
    : null;

  // Separate inline agent objects from name-references (strings)
  const inlineAgents = (
    parsed.agents as (z.infer<typeof AgentConfigSchema> | string)[]
  ).filter(
    (a): a is z.infer<typeof AgentConfigSchema> => typeof a === "object",
  );
  const nameRefs = (
    parsed.agents as (z.infer<typeof AgentConfigSchema> | string)[]
  ).filter((a): a is string => typeof a === "string");

  // Load agents from agentsDir — filtered to nameRefs when any are present
  const agentsFromDir = loadAgentsFromDir(resolvedAgentsDir, nameRefs);

  return {
    ...parsed,
    agents: [...inlineAgents, ...agentsFromDir],
    runsDir: path.resolve(configDir, parsed.runsDir),
    tasksDir: path.resolve(configDir, parsed.tasksDir),
  };
}

/**
 * Loads agent definitions from agentsDir.
 * When nameRefs is non-empty, only loads agents whose names match the list.
 * When nameRefs is empty, loads all *.agent.json files in the directory.
 */
function loadAgentsFromDir(
  agentsDir: string | null,
  nameRefs: string[],
): BenchConfig["agents"] {
  if (!agentsDir || !fs.existsSync(agentsDir)) return [];
  const files = fs
    .readdirSync(agentsDir)
    .filter((f) => f.endsWith(".agent.json"))
    .sort();

  const all = files.map((f) => {
    const filePath = path.join(agentsDir, f);
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return AgentConfigSchema.parse(raw);
  });

  if (nameRefs.length === 0) return all;

  // Filter to only the referenced names, in the order they were listed
  return nameRefs.map((name) => {
    const found = all.find((a) => a.name === name);
    if (!found) {
      throw new Error(
        `Agent "${name}" not found in agentsDir "${agentsDir}". ` +
          `Available: ${all.map((a) => a.name).join(", ")}`,
      );
    }
    return found;
  });
}

/**
 * Merges a variant's overrides into the base agent config for that variant,
 * producing the effective AgentConfig to use when running the variant.
 *
 * Resolution order (later wins):
 *   base agent config → variantDefaults → variant's own settings
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
  const base = agents.find((a) => a.name === agentName);
  if (!base) {
    throw new Error(
      `Variant "${variant.name}": agent "${agentName}" not found. ` +
        `Available: ${agents.map((a) => a.name).join(", ")}`,
    );
  }

  // Apply defaults on top of base, then variant's own settings on top
  const effectiveModel = variant.model ?? defaults?.model ?? base.model;
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

  return {
    ...base,
    ...(effectiveModel !== undefined ? { model: effectiveModel } : {}),
    model_params:
      Object.keys(effectiveModelParams).length > 0
        ? effectiveModelParams
        : base.model_params,
    setup: Object.keys(effectiveSetup).length > 0 ? effectiveSetup : base.setup,
  };
}
