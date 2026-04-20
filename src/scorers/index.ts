import fs from "fs";
import path from "path";
import type {
  AgentInvokeResult,
  BenchConfig,
  JudgeConfig,
  ScoringResult,
} from "../types";
import { runLLMJudge } from "./llm-judge";

/**
 * Reads all source files from the workspace into a single snapshot string
 * to pass to the LLM judge.
 */
function buildWorkspaceSnapshot(workspacePath: string): string {
  const SKIP = new Set(["node_modules", ".git", "dist", "build"]);
  const EXTS = new Set([
    ".ts",
    ".tsx",
    "",
    ".jsx",
    ".json",
    ".md",
    ".html",
    ".css",
    ".py",
    ".go",
    ".rs",
    ".java",
  ]);
  const parts: string[] = [];

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name)) walk(path.join(dir, entry.name));
      } else if (EXTS.has(path.extname(entry.name))) {
        const filePath = path.join(dir, entry.name);
        const rel = path.relative(workspacePath, filePath);
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          parts.push(`### ${rel}\n\`\`\`\n${content}\n\`\`\``);
        } catch {
          // skip unreadable
        }
      }
    }
  }

  walk(workspacePath);
  return parts.join("\n\n");
}

/**
 * Computes a weighted average of available scores.
 * LLM-judge and tests each count equally; manual also counts equally.
 */
function computeOverall(result: Partial<ScoringResult>): number | null {
  const scores: number[] = [];

  if (result.llmJudge != null) scores.push(result.llmJudge.score);
  if (result.tests != null) scores.push(result.tests.score);

  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export async function scoreRun(
  workspacePath: string,
  bench: BenchConfig,
  _invokeResult: AgentInvokeResult,
  judgeConfig?: JudgeConfig,
): Promise<ScoringResult> {
  const snapshot = buildWorkspaceSnapshot(workspacePath);
  const output: Partial<ScoringResult> = {};

  if (!judgeConfig) {
    console.warn(
      "llm-judge scoring requested but no judge config provided; skipping.",
    );
  }
  try {
    output.llmJudge = await runLLMJudge(bench, snapshot, bench.judge);
  } catch (err) {
    console.warn(`LLM judge failed: ${(err as Error).message}`);
  }

  return {
    ...output,
    overall: computeOverall(output),
  };
}
