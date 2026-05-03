import fs from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { BenchConfig } from "./types.js";

const CommandsConfigSchema = z.object({
  before: z.array(z.string()).optional(),
  after: z.array(z.string()).optional(),
});

const SetupConfigSchema = z.object({
  files: z.record(z.string(), z.string()).optional(),
  commands: CommandsConfigSchema.optional(),
});

const CopilotAgentOptionsSchema = z.object({
  reasoningEffort: z.enum(["low", "medium", "high", "xhigh"]).optional(),
  effort: z.enum(["low", "medium", "high", "xhigh"]).optional(),
  addDir: z.array(z.string()).optional(),
  addGithubMcpTool: z.array(z.string()).optional(),
  addGithubMcpToolset: z.array(z.string()).optional(),
  additionalMcpConfig: z.array(z.string()).optional(),
  agent: z.string().optional(),
  allowAll: z.boolean().optional(),
  allowAllTools: z.boolean().optional(),
  allowAllPaths: z.boolean().optional(),
  allowAllUrls: z.boolean().optional(),
  allowTool: z.array(z.string()).optional(),
  allowUrl: z.array(z.string()).optional(),
  autopilot: z.boolean().optional(),
  availableTools: z.array(z.string()).optional(),
  banner: z.boolean().optional(),
  bashEnv: z.union([z.enum(["on", "off"]), z.boolean()]).optional(),
  denyTool: z.array(z.string()).optional(),
  denyUrl: z.array(z.string()).optional(),
  disableBuiltinMcps: z.boolean().optional(),
  disableMcpServer: z.array(z.string()).optional(),
  disallowTempDir: z.boolean().optional(),
  enableAllGithubMcpTools: z.boolean().optional(),
  enableReasoningSummaries: z.boolean().optional(),
  excludedTools: z.array(z.string()).optional(),
  experimental: z.boolean().optional(),
  outputFormat: z.enum(["json", "text"]).optional(),
  logDir: z.string().optional(),
  logLevel: z
    .enum(["none", "error", "warning", "info", "debug", "all", "default"])
    .optional(),
  maxAutopilotContinues: z.number().int().nonnegative().optional(),
  mode: z.enum(["interactive", "plan", "autopilot"]).optional(),
  mouse: z.union([z.enum(["on", "off"]), z.boolean()]).optional(),
  noAskUser: z.boolean().optional(),
  noAutoUpdate: z.boolean().optional(),
  noBashEnv: z.boolean().optional(),
  noColor: z.boolean().optional(),
  noCustomInstructions: z.boolean().optional(),
  noMouse: z.boolean().optional(),
  noRemote: z.boolean().optional(),
  plainDiff: z.boolean().optional(),
  pluginDir: z.array(z.string()).optional(),
  remote: z.boolean().optional(),
  resume: z.union([z.boolean(), z.string()]).optional(),
  connect: z.union([z.boolean(), z.string()]).optional(),
  continue: z.boolean().optional(),
  plan: z.boolean().optional(),
  silent: z.boolean().optional(),
  screenReader: z.boolean().optional(),
  secretEnvVars: z.array(z.string()).optional(),
  share: z.union([z.boolean(), z.string()]).optional(),
  shareGist: z.boolean().optional(),
  stream: z.enum(["on", "off"]).optional(),
  yolo: z.boolean().optional(),
  configDir: z.string().optional(),
});

const GeminiAgentOptionsSchema = z.object({
  debug: z.boolean().optional(),
  model: z.string().optional(),
  worktree: z.union([z.boolean(), z.string()]).optional(),
  sandbox: z.boolean().optional(),
  yolo: z.boolean().optional(),
  approvalMode: z.enum(["default", "auto_edit", "yolo", "plan"]).optional(),
  policy: z.array(z.string()).optional(),
  adminPolicy: z.array(z.string()).optional(),
  acp: z.boolean().optional(),
  experimentalAcp: z.boolean().optional(),
  allowedMcpServerNames: z.array(z.string()).optional(),
  allowedTools: z.array(z.string()).optional(),
  extensions: z.array(z.string()).optional(),
  resume: z.string().optional(),
  includeDirectories: z.array(z.string()).optional(),
  screenReader: z.boolean().optional(),
  outputFormat: z.enum(["text", "json", "stream-json"]).optional(),
  rawOutput: z.boolean().optional(),
  acceptRawOutputRisk: z.boolean().optional(),
});

const OpencodeAgentOptionsSchema = z.object({
  agent: z.string().optional(),
  continue: z.boolean().optional(),
  session: z.string().optional(),
  fork: z.boolean().optional(),
  share: z.boolean().optional(),
  file: z.array(z.string()).optional(),
  title: z.string().optional(),
  attach: z.string().optional(),
  password: z.string().optional(),
  dir: z.string().optional(),
  port: z.number().int().nonnegative().optional(),
  variant: z.string().optional(),
  thinking: z.boolean().optional(),
  dangerouslySkipPermissions: z.boolean().optional(),
  command: z.string().optional(),
  pure: z.boolean().optional(),
  logLevel: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).optional(),
  printLogs: z.boolean().optional(),
});

const AgentConfigSchema = z.object({
  type: z.string(),
  cmd: z.string().optional(),
  args: z.array(z.string()).optional(),
  model: z.string().optional(),
  model_params: z.record(z.string(), z.unknown()).optional(),
  costPerMillionTokens: z.number().optional(),
  pricing: z
    .object({
      inputCostPerMillionTokens: z.number(),
      outputCostPerMillionTokens: z.number(),
    })
    .optional(),
  options: z
    .union([
      CopilotAgentOptionsSchema,
      GeminiAgentOptionsSchema,
      OpencodeAgentOptionsSchema,
    ])
    .optional(),
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
    provider: z.enum(["copilot", "gemini", "opencode"]).default("copilot"),
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
  description: z.string().optional(),
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

  // Derive benchmark name from config filename: "bench.bench.yaml" → "bench"
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
