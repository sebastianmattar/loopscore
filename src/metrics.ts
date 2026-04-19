import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import ts from "typescript";
import type { ComplexityResult, Metrics } from "./types";

// ── Public API ────────────────────────────────────────────────────────────────

export async function collectMetrics(
  workspacePath: string,
  agentStdout: string,
  startedAt: Date,
  completedAt: Date,
): Promise<Metrics> {
  const timeMs = completedAt.getTime() - startedAt.getTime();
  const lineCount = measureLineCount(workspacePath);
  const complexity = measureComplexity(workspacePath);
  const tokenCount = estimateTokens(workspacePath, agentStdout);

  return { timeMs, lineCount, tokenCount, complexity };
}

// ── Time ──────────────────────────────────────────────────────────────────────
// (computed inline in collectMetrics above)

// ── Line Count ────────────────────────────────────────────────────────────────

/**
 * Returns the total number of lines added in the workspace since the initial
 * empty git commit, using `git diff HEAD --numstat`.
 */
function measureLineCount(workspacePath: string): number {
  try {
    execSync("git add -A", { cwd: workspacePath, stdio: "ignore" });
    const output = execSync("git diff HEAD --numstat", {
      cwd: workspacePath,
      encoding: "utf-8",
    });
    let added = 0;
    for (const line of output.split("\n")) {
      const match = line.match(/^(\d+)\s+\d+\s+/);
      if (match) {
        added += parseInt(match[1], 10);
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
