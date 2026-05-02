import { execFileSync } from "child_process";
import { spawnAgent } from "../runner/subprocess.js";
import type {
  AgentConfig,
  AgentInvokeResult,
  JudgeProvider,
  VariantConfig,
} from "../types.js";

export interface CLIProvider {
  name: JudgeProvider;
  command: string;
  defaultAgentArgs: string[];
  buildAgentOptionArgs(
    options: Record<string, unknown>,
    workspacePath: string,
  ): string[];
  buildJudgeArgs(prompt: string, model?: string): string[];
  extractJudgeContent(stdout: string): string;
  validateEnvironment?(): void;
}

function replaceTemplateVars(
  value: string,
  variables: Record<string, string>,
): string {
  let resolved = value;
  for (const [key, replacement] of Object.entries(variables)) {
    resolved = resolved.replaceAll(`{${key}}`, replacement);
  }
  return resolved;
}

function formatExecError(prefix: string, err: unknown): Error {
  const spawnErr = err as {
    stdout?: string;
    stderr?: string;
    message?: string;
  };
  const detail = spawnErr.stderr ?? spawnErr.message ?? String(err);
  return new Error(`${prefix}: ${detail}`, { cause: err });
}

function resolveAgentConfig(
  provider: CLIProvider,
  agentConfig: Partial<AgentConfig> | undefined,
): AgentConfig {
  return {
    type: provider.name,
    cmd: provider.command,
    args: provider.defaultAgentArgs,
    ...agentConfig,
  };
}

export function getProviderVersion(
  provider: CLIProvider,
  agentConfig: AgentConfig,
): string {
  const resolvedConfig = resolveAgentConfig(provider, agentConfig);
  try {
    return (
      execFileSync(resolvedConfig.cmd!, ["--version"], {
        timeout: 5000,
        encoding: "utf-8",
      })
        .trim()
        .split("\n")[0] ?? "unknown"
    );
  } catch {
    return "unknown";
  }
}

export async function runProviderHealthcheck(
  provider: CLIProvider,
  agentConfig: AgentConfig,
): Promise<void> {
  const resolvedConfig = resolveAgentConfig(provider, agentConfig);
  try {
    execFileSync(resolvedConfig.cmd!, ["--version"], {
      stdio: "ignore",
      timeout: 8000,
    });
  } catch {
    throw new Error(
      `Agent "${resolvedConfig.type}" healthcheck failed: command "${resolvedConfig.cmd}" not found or returned an error. ` +
        `Make sure it is installed and available in PATH.`,
    );
  }

  provider.validateEnvironment?.();
}

export function invokeProviderAgent(
  provider: CLIProvider,
  workspacePath: string,
  variant: VariantConfig,
): Promise<AgentInvokeResult> {
  const resolvedAgent = resolveAgentConfig(provider, variant.agent);
  const prompt = variant.query?.join("\n") ?? "";
  const templateVariables = {
    prompt,
    requirementsContent: prompt,
    workspacePath,
  };

  const resolvedArgs = (resolvedAgent.args ?? []).map((arg) =>
    replaceTemplateVars(arg, templateVariables),
  );
  const optionArgs = provider
    .buildAgentOptionArgs(
      (resolvedAgent.options as Record<string, unknown>) ?? {},
      workspacePath,
    )
    .map((arg) => replaceTemplateVars(arg, templateVariables));

  return spawnAgent(
    resolvedAgent.cmd!,
    [...resolvedArgs, ...optionArgs],
    workspacePath,
  );
}

export async function runProviderJudge(
  provider: CLIProvider,
  systemPrompt: string,
  userPrompt: string,
  model?: string,
): Promise<string> {
  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  try {
    const stdout = execFileSync(
      provider.command,
      provider.buildJudgeArgs(fullPrompt, model),
      {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    return provider.extractJudgeContent(stdout);
  } catch (err: unknown) {
    throw formatExecError(`${provider.name} CLI judge failed`, err);
  }
}
