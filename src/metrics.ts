import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import ts from "typescript";
import type { ComplexityResult, Metrics } from "./types.js";

// ── Public API ────────────────────────────────────────────────────────────────

export async function collectMetrics(
  workspacePath: string,
  agentStdout: string,
  startedAt: Date,
  completedAt: Date,
  costPerMillionTokens?: number,
): Promise<Metrics> {
  const timeMs = completedAt.getTime() - startedAt.getTime();
  const lineCount = measureLineCount(workspacePath);
  const complexity = measureComplexity(workspacePath);
  const tokenCount = estimateTokens(workspacePath, agentStdout);
  const estimatedCostUsd =
    costPerMillionTokens != null
      ? +((tokenCount / 1_000_000) * costPerMillionTokens).toFixed(6)
      : null;

  return { timeMs, lineCount, tokenCount, estimatedCostUsd, complexity };
}

// ── Time ──────────────────────────────────────────────────────────────────────
// (computed inline in collectMetrics above)

// ── Line Count ────────────────────────────────────────────────────────────────

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".rb",
  ".java",
  ".c",
  ".cpp",
  ".cc",
  ".h",
  ".hpp",
  ".cs",
  ".php",
  ".swift",
  ".kt",
  ".kts",
  ".scala",
  ".clj",
  ".vue",
  ".svelte",
  ".html",
  ".css",
  ".scss",
  ".less",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".sql",
  ".graphql",
  ".proto",
]);

/**
 * Returns the total number of code lines added in the workspace since the
 * initial empty git commit. Non-code files (docs, images, JSON, etc.) are
 * excluded so the metric reflects actual implementation effort.
 */
function measureLineCount(workspacePath: string): number {
  try {
    execSync("git add -A", { cwd: workspacePath, stdio: "ignore" });
    // Commit any uncommitted changes so they appear in the commit history,
    // then diff from the baseline tag to HEAD — this captures everything the
    // agent generated regardless of whether it committed along the way.
    execSync('git commit --allow-empty -m "loopscore-snapshot"', {
      cwd: workspacePath,
      stdio: "ignore",
    });
    const output = execSync("git diff loopscore-baseline HEAD --numstat", {
      cwd: workspacePath,
      encoding: "utf-8",
    });
    let added = 0;
    for (const line of output.split("\n")) {
      const match = line.match(/^(\d+)\s+\d+\s+(.+)$/);
      if (match) {
        const filePath = match[2].trim();
        const ext = path.extname(filePath).toLowerCase();
        if (CODE_EXTENSIONS.has(ext)) {
          added += parseInt(match[1], 10);
        }
      }
    }
    return added;
  } catch {
    return 0;
  }
}

// ── Cyclomatic Complexity ─────────────────────────────────────────────────────

/**
 * Calculates the average cyclomatic complexity across all TS/JS source files
 * in the workspace (excluding node_modules and .git).
 */
function measureComplexity(workspacePath: string): ComplexityResult | null {
  const files = collectSourceFiles(workspacePath);
  if (files.length === 0) return null;

  let totalComplexity = 0;
  let analyzed = 0;

  for (const file of files) {
    try {
      const source = fs.readFileSync(file, "utf-8");
      totalComplexity += computeFileCyclomaticComplexity(source);
      analyzed++;
    } catch {
      // skip unreadable files
    }
  }

  if (analyzed === 0) return null;

  return {
    cyclomatic: Math.round(totalComplexity / analyzed),
    filesAnalyzed: analyzed,
  };
}

function collectSourceFiles(dir: string): string[] {
  const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
  const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build"]);
  const results: string[] = [];

  function walk(current: string) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          walk(path.join(current, entry.name));
        }
      } else if (EXTENSIONS.has(path.extname(entry.name))) {
        results.push(path.join(current, entry.name));
      }
    }
  }

  walk(dir);
  return results;
}

/**
 * Counts cyclomatic complexity of a TypeScript/JavaScript source file
 * using the TypeScript compiler AST. Starts at 1 (base complexity) and
 * increments for each branching node.
 */
function computeFileCyclomaticComplexity(source: string): number {
  const sourceFile = ts.createSourceFile(
    "temp.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
  );

  let complexity = 1;

  function visit(node: ts.Node) {
    switch (node.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.CaseClause:
      case ts.SyntaxKind.CatchClause:
      case ts.SyntaxKind.ConditionalExpression:
        complexity++;
        break;
      case ts.SyntaxKind.BinaryExpression: {
        const op = (node as ts.BinaryExpression).operatorToken.kind;
        if (
          op === ts.SyntaxKind.AmpersandAmpersandToken ||
          op === ts.SyntaxKind.BarBarToken ||
          op === ts.SyntaxKind.QuestionQuestionToken
        ) {
          complexity++;
        }
        break;
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return complexity;
}

// ── Token Estimation ──────────────────────────────────────────────────────────

/**
 * Estimates total token usage by counting characters in generated source files
 * and dividing by 4 (a standard heuristic for English/code content).
 * Falls back to counting chars in agent stdout if no source files found.
 */
function estimateTokens(workspacePath: string, agentStdout: string): number {
  const files = collectSourceFiles(workspacePath);

  let totalChars = 0;
  for (const file of files) {
    try {
      totalChars += fs.readFileSync(file).length;
    } catch {
      // skip
    }
  }

  if (totalChars === 0) {
    totalChars = agentStdout.length;
  }

  return Math.ceil(totalChars / 4);
}
