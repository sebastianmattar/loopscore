import { execFileSync } from "child_process";
import type {
  CriterionScore,
  JudgeProvider,
  LLMJudgeResult,
} from "../types.js";

const SYSTEM_PROMPT = `You are an expert code reviewer evaluating AI-generated implementations.
You will be given acceptance criteria and the contents of a workspace containing the generated code.
Score each criterion from 0.0 (not met) to 1.0 (fully met) and provide concise reasoning.
Also write a short "summary" (2-3 sentences) giving an overall human-readable assessment.
Respond ONLY with valid JSON — no markdown fences, no extra text.`;

interface JudgeResponse {
  criteria: CriterionScore[];
  overall: number;
  reasoning: string;
  summary: string;
}

function buildUserPrompt(
  acceptanceCriteria: string[],
  workspaceSnapshot: string,
): string {
  return [
    "## Acceptance Criteria",
    acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n"),
    "",
    "## Generated Workspace",
    workspaceSnapshot,
    "",
    "## Instructions",
    "Evaluate the workspace against each acceptance criterion.",
    "Return JSON with this exact shape:",
    JSON.stringify(
      {
        criteria: [{ criterion: "...", score: 0.9, reasoning: "..." }],
        overall: 0.9,
        reasoning: "Detailed technical assessment",
        summary: "2-3 sentence plain-English summary for humans.",
      },
      null,
      2,
    ),
  ].join("\n");
}

function parseJudgeResponse(text: string): JudgeResponse {
  // Strip markdown fences if present
  const cleaned = text.replace(/```(?:json)?\n?/g, "").trim();
  const parsed = JSON.parse(cleaned) as JudgeResponse;

  if (!Array.isArray(parsed.criteria) || typeof parsed.overall !== "number") {
    throw new Error("Invalid judge response shape");
  }

  return parsed;
}

/**
 * Invokes the `copilot` CLI in non-interactive mode to get a judge response.
 * Uses pre-existing auth — no API key or token needed.
 *
 * Spawns: copilot -p "<prompt>" --output-format json [--model <model>]
 * Parses the JSONL output to extract the final assistant message content.
 */
async function judgeWithCopilotCLI(
  userPrompt: string,
  model?: string,
): Promise<LLMJudgeResult> {
  const fullPrompt = `${SYSTEM_PROMPT}\n\n${userPrompt}`;

  const args = ["-p", fullPrompt, "--output-format", "json"];
  if (model) args.push("--model", model);

  let stdout: string;
  try {
    stdout = execFileSync("copilot", args, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024, // 10 MB — workspace snapshots can be large
    });
  } catch (err: unknown) {
    const spawnErr = err as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    const detail = spawnErr.stderr ?? spawnErr.message ?? String(err);
    throw new Error(`copilot CLI judge failed: ${detail}`, { cause: err });
  }

  // Parse JSONL: find the assistant.message with phase === "final_answer"
  const lines = stdout.split("\n").filter(Boolean);
  let content = "";
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as {
        type: string;
        data?: { content?: string; phase?: string };
      };
      if (
        event.type === "assistant.message" &&
        event.data?.phase === "final_answer" &&
        event.data.content
      ) {
        content = event.data.content;
        break;
      }
    } catch {
      // skip malformed lines
    }
  }

  if (!content) {
    throw new Error(
      "copilot CLI judge: could not extract assistant response from output",
    );
  }

  const parsed = parseJudgeResponse(content);
  const resolvedModel = model ?? "copilot-default";

  return {
    score: parsed.overall,
    criteria: parsed.criteria,
    reasoning: parsed.reasoning,
    summary: parsed.summary ?? "",
    provider: "copilot",
    model: resolvedModel,
  };
}

/**
 * Invokes the `gemini` CLI in non-interactive mode to get a judge response.
 * Uses pre-existing auth/config from the local Gemini CLI environment.
 *
 * Spawns: gemini -p "<prompt>" --output-format text [--model <model>]
 */
async function judgeWithGeminiCLI(
  userPrompt: string,
  model?: string,
): Promise<LLMJudgeResult> {
  const fullPrompt = `${SYSTEM_PROMPT}\n\n${userPrompt}`;

  const args = ["-p", fullPrompt, "--output-format", "text"];
  if (model) args.push("--model", model);

  let stdout: string;
  try {
    stdout = execFileSync("gemini", args, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024, // 10 MB — workspace snapshots can be large
    });
  } catch (err: unknown) {
    const spawnErr = err as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    const detail = spawnErr.stderr ?? spawnErr.message ?? String(err);
    throw new Error(`gemini CLI judge failed: ${detail}`, { cause: err });
  }

  const parsed = parseJudgeResponse(stdout);
  const resolvedModel = model ?? "gemini-default";

  return {
    score: parsed.overall,
    criteria: parsed.criteria,
    reasoning: parsed.reasoning,
    summary: parsed.summary ?? "",
    provider: "gemini",
    model: resolvedModel,
  };
}

export async function runLLMJudge(
  acceptanceCriteria: string[],
  workspaceSnapshot: string,
  provider: JudgeProvider,
  model?: string,
): Promise<LLMJudgeResult> {
  const userPrompt = buildUserPrompt(acceptanceCriteria, workspaceSnapshot);

  switch (provider) {
    case "copilot": {
      // Uses the `copilot` CLI in non-interactive mode — no API key needed,
      // authentication is handled by the pre-existing copilot CLI session.
      return judgeWithCopilotCLI(userPrompt, model);
    }
    case "gemini": {
      // Uses the `gemini` CLI in non-interactive mode.
      return judgeWithGeminiCLI(userPrompt, model);
    }
  }
}
