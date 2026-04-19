import fs from "fs";
import path from "path";
import { z } from "zod";
import type { BenchConfig } from "./types";

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
  agents: z.array(AgentConfigSchema).default([]),
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

  // Load agent definitions from agentsDir (*.agent.json files)
  const agentsFromDir = loadAgentsFromDir(
    parsed.agentsDir ? path.resolve(configDir, parsed.agentsDir) : null,
  );

  return {
    ...parsed,
    agents: [...parsed.agents, ...agentsFromDir],
    runsDir: path.resolve(configDir, parsed.runsDir),
    tasksDir: path.resolve(configDir, parsed.tasksDir),
  };
}

/**
 * Loads all *.agent.json files from the given directory as AgentConfigs.
 * Each file should contain a single AgentConfig object.
 */
function loadAgentsFromDir(agentsDir: string | null): BenchConfig["agents"] {
  if (!agentsDir || !fs.existsSync(agentsDir)) return [];
  const files = fs
    .readdirSync(agentsDir)
    .filter((f) => f.endsWith(".agent.json"))
    .sort();
  return files.map((f) => {
    const filePath = path.join(agentsDir, f);
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return AgentConfigSchema.parse(raw);
  });
}
