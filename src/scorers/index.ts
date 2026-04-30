import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import type {
  AgentInvokeResult,
  BenchConfig,
  Measurements,
  ScoringResult,
  TestResult,
} from "../types.js";
import { runLLMJudge } from "./llm-judge.js";

/**
 * Returns the set of absolute file paths that were added or modified
 * after the loopscore-baseline tag. Falls back to null if git is unavailable
 * or the tag doesn't exist (caller should include all files in that case).
 */
function getPostBaselineFiles(workspacePath: string): Set<string> | null {
  try {
    const output = execSync("git diff loopscore-baseline HEAD --name-only", {
      cwd: workspacePath,
      encoding: "utf-8",
    });
    const files = output.split("\n").filter(Boolean);
    return new Set(files.map((f) => path.resolve(workspacePath, f)));
  } catch {
    return null;
  }
}

/**
 * Reads source files from the workspace into a single snapshot string
 * to pass to the LLM judge. Only includes files added/changed after the
 * loopscore-baseline tag (i.e., agent-generated files, not setup files).
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
  const postBaseline = getPostBaselineFiles(workspacePath);

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name)) walk(path.join(dir, entry.name));
      } else if (EXTS.has(path.extname(entry.name))) {
        const filePath = path.join(dir, entry.name);
        // If we have a baseline filter, only include post-baseline files
        if (
          postBaseline !== null &&
          !postBaseline.has(path.resolve(filePath))
        ) {
          continue;
        }
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

type ShellMeasure = Measurements & { type: "shell" };

/**
 * Runs shell-command checks in the agent workspace and returns a TestResult[].
 * Each check passes if the command exits with code 0.
 */
function runChecks(
  checks: ShellMeasure[],
  workspacePath: string,
): TestResult[] {
  const results: TestResult[] = [];

  for (const check of checks) {
    try {
      const out = execSync(check.command, {
        cwd: workspacePath,
        encoding: "utf-8",
        stdio: "pipe",
      });
      results.push({
        name: check.name,
        success: true,
        score: check.scoreIfPasses,
        output: out.trim(),
      });
    } catch (err: unknown) {
      const stderr =
        err instanceof Error && "stderr" in err
          ? String((err as { stderr?: unknown }).stderr)
          : "";
      results.push({
        name: check.name,
        success: false,
        score: check.scoreIfFails,
        output: stderr.trim(),
      });
    }
  }

  return results;
}

/**
 * Computes a weighted average of available scores.
 * LLM-judge and checks each count equally.
 */
function computeOverall(result: Partial<ScoringResult>): number | null {
  const scores: number[] = [];

  if (result.llmJudge != null) scores.push(result.llmJudge.score);
  if (result.checks != null && result.checks.length > 0) {
    const avg =
      result.checks.reduce((sum, c) => sum + c.score, 0) / result.checks.length;
    scores.push(avg);
  }

  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export async function scoreRun(
  workspacePath: string,
  bench: BenchConfig,
  _invokeResult: AgentInvokeResult,
): Promise<ScoringResult> {
  const snapshot = buildWorkspaceSnapshot(workspacePath);
  const output: Partial<ScoringResult> = {};

  const judgeMeasure = bench.measure.find(
    (m): m is Measurements & { type: "judge" } => m.type === "judge",
  );
  const shellMeasures = bench.measure.filter(
    (m): m is ShellMeasure => m.type === "shell",
  );

  if (judgeMeasure) {
    try {
      output.llmJudge = await runLLMJudge(
        judgeMeasure.acceptanceCriteria ?? [],
        snapshot,
        judgeMeasure.provider,
        judgeMeasure.model,
      );
    } catch (err) {
      console.warn(`LLM judge failed: ${(err as Error).message}`);
    }
  }

  if (shellMeasures.length > 0) {
    output.checks = runChecks(shellMeasures, workspacePath);
  }

  return {
    ...output,
    overall: computeOverall(output),
  };
}
