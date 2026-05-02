import { runProviderJudge } from "../providers/base.js";
import { getProvider } from "../providers/index.js";
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

export async function runLLMJudge(
  acceptanceCriteria: string[],
  workspaceSnapshot: string,
  provider: JudgeProvider,
  model?: string,
): Promise<LLMJudgeResult> {
  const userPrompt = buildUserPrompt(acceptanceCriteria, workspaceSnapshot);
  const rawResponse = await runProviderJudge(
    getProvider(provider),
    SYSTEM_PROMPT,
    userPrompt,
    model,
  );
  const parsed = parseJudgeResponse(rawResponse);

  return {
    score: parsed.overall,
    criteria: parsed.criteria,
    reasoning: parsed.reasoning,
    summary: parsed.summary ?? "",
    provider,
    model: model ?? `${provider}-default`,
  };
}
