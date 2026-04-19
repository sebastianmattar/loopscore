import fs from "fs";
import path from "path";
import { z } from "zod";
import type { BenchConfig } from "./types.js";

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

const JudgeConfigSchema = z.object({
  provider: z.enum(["copilot", "openai", "anthropic"]).default("copilot"),
  model: z.string().optional(),
  apiKey: z.string().optional(),
});

const BenchConfigSchema = z.object({
  agents: z.array(z.union([AgentConfigSchema, z.string()])).default([]),
  agentsDir: z.string().optional(),
  defaultRuns: z.number().int().min(1).default(3),
  runsDir: z.string().default("./runs"),
  tasksDir: z.string().default("./tasks"),
  judge: JudgeConfigSchema.optional(),
});

const DEFAULT_CONFIG: BenchConfig = {
  agents: [],
  defaultRuns: 3,
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
