import fs from "fs";
import path from "path";
import type {
  AgentInvokeResult,
  JudgeConfig,
  ScoringMethod,
  ScoringResult,
  Task,
} from "../types";
import { runLLMJudge } from "./llm-judge";
import { createManualPending } from "./manual";
import { runTests } from "./test-runner";

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
  if (result.manual?.pending === false && result.manual.score != null) {
    scores.push(result.manual.score);
  }

  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export async function scoreRun(
  workspacePath: string,
  task: Task,
  _invokeResult: AgentInvokeResult,
  judgeConfig?: JudgeConfig,
): Promise<ScoringResult> {
  const methods: ScoringMethod[] = task.scoring?.methods ?? ["llm-judge"];
  const partial: Partial<ScoringResult> = { methods };

  const snapshot = buildWorkspaceSnapshot(workspacePath);

  for (const method of methods) {
    switch (method) {
      case "llm-judge": {
        if (!judgeConfig) {
          console.warn(
            "llm-judge scoring requested but no judge config provided; skipping.",
          );
          break;
        }
        try {
          partial.llmJudge = await runLLMJudge(task, snapshot, judgeConfig);
        } catch (err) {
          console.warn(`LLM judge failed: ${(err as Error).message}`);
        }
        break;
      }

      case "tests": {
        const testsCmd = task.scoring?.tests_cmd;
        if (!testsCmd) {
          console.warn(
            "tests scoring requested but no tests_cmd provided; skipping.",
          );
          break;
        }
        partial.tests = runTests(workspacePath, testsCmd);
        break;
      }

      case "manual": {
        partial.manual = createManualPending();
        break;
      }
    }
  }

  return {
    methods,
    llmJudge: partial.llmJudge,
    tests: partial.tests,
    manual: partial.manual,
    overall: computeOverall(partial),
  };
}
