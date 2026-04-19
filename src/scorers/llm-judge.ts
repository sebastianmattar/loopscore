import Anthropic from "@anthropic-ai/sdk";
import { execFileSync } from "child_process";
import OpenAI from "openai";
import type {
  CriterionScore,
  JudgeConfig,
  JudgeProvider,
  LLMJudgeResult,
  Task,
} from "../types";

const SYSTEM_PROMPT = `You are an expert code reviewer evaluating AI-generated implementations.
You will be given acceptance criteria and the contents of a workspace containing the generated code.
Score each criterion from 0.0 (not met) to 1.0 (fully met) and provide concise reasoning.
Respond ONLY with valid JSON — no markdown fences, no extra text.`;

interface JudgeResponse {
  criteria: CriterionScore[];
  overall: number;
  reasoning: string;
}

function buildUserPrompt(task: Task, workspaceSnapshot: string): string {
  return [
    "## Acceptance Criteria",
    task.acceptance_criteria.map((c, i) => `${i + 1}. ${c}`).join("\n"),
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
        reasoning: "Overall assessment",
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

async function judgeWithOpenAICompat(
  userPrompt: string,
  baseURL: string,
  apiKey: string,
  model: string,
  provider: JudgeProvider,
): Promise<LLMJudgeResult> {
  const client = new OpenAI({ baseURL, apiKey });

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });

  const content = response.choices[0]?.message?.content ?? "";
  const parsed = parseJudgeResponse(content);

  return {
    score: parsed.overall,
    criteria: parsed.criteria,
    reasoning: parsed.reasoning,
    provider,
    model,
  };
}

async function judgeWithAnthropic(
  userPrompt: string,
  apiKey: string,
  model: string,
): Promise<LLMJudgeResult> {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const content =
    response.content[0].type === "text" ? response.content[0].text : "";
  const parsed = parseJudgeResponse(content);

  return {
    score: parsed.overall,
    criteria: parsed.criteria,
    reasoning: parsed.reasoning,
    provider: "anthropic",
    model,
  };
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
    throw new Error(`copilot CLI judge failed: ${detail}`);
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
    provider: "copilot",
    model: resolvedModel,
  };
}

export async function runLLMJudge(
  task: Task,
  workspaceSnapshot: string,
  judgeConfig: JudgeConfig,
): Promise<LLMJudgeResult> {
  const userPrompt = buildUserPrompt(task, workspaceSnapshot);
  const { provider, model, apiKey } = judgeConfig;

  switch (provider) {
    case "copilot": {
      // Uses the `copilot` CLI in non-interactive mode — no API key needed,
      // authentication is handled by the pre-existing copilot CLI session.
      return judgeWithCopilotCLI(userPrompt, model);
    }

    case "openai": {
      const token = apiKey ?? process.env.OPENAI_API_KEY ?? "";
      if (!token) {
        throw new Error(
          "OpenAI judge requires OPENAI_API_KEY environment variable or judge.apiKey in config.",
        );
      }
      return judgeWithOpenAICompat(
        userPrompt,
        "https://api.openai.com/v1",
        token,
        model ?? "gpt-4o",
        "openai",
      );
    }

    case "anthropic": {
      const token = apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
      if (!token) {
        throw new Error(
          "Anthropic judge requires ANTHROPIC_API_KEY environment variable or judge.apiKey in config.",
        );
      }
      return judgeWithAnthropic(
        userPrompt,
        token,
        model ?? "claude-3-5-sonnet-20241022",
      );
    }
  }
}
