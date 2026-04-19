import { execSync } from "child_process";
import type { TestResult } from "../types.js";

export function runTests(workspacePath: string, testsCmd: string): TestResult {
  let output = "";
  let exitCode = 0;

  try {
    output = execSync(testsCmd, {
      cwd: workspacePath,
      encoding: "utf-8",
      timeout: 120_000,
    });
  } catch (err: unknown) {
    const spawnError = err as {
      status?: number;
      stdout?: string;
      stderr?: string;
    };
    exitCode = spawnError.status ?? 1;
    output = [spawnError.stdout ?? "", spawnError.stderr ?? ""]
      .filter(Boolean)
      .join("\n");
  }

  const { passed, failed } = parseTestCounts(output, exitCode);
  const total = passed + failed;
  const score = total > 0 ? passed / total : exitCode === 0 ? 1 : 0;

  return { passed, failed, total, score, output };
}

/**
 * Heuristic parser for common test runner output formats.
 * Attempts to detect counts from Jest, Vitest, Mocha, and plain exit code.
 */
function parseTestCounts(
  output: string,
  exitCode: number,
): { passed: number; failed: number } {
  // Jest / Vitest: "Tests: 3 passed, 1 failed"
  const jestMatch = output.match(
    /Tests?:\s+(?:(\d+)\s+passed)?(?:,\s*)?(?:(\d+)\s+failed)?/i,
  );
  if (jestMatch) {
    return {
      passed: parseInt(jestMatch[1] ?? "0", 10),
      failed: parseInt(jestMatch[2] ?? "0", 10),
    };
  }

  // Mocha: "3 passing" / "1 failing"
  const passingMatch = output.match(/(\d+)\s+passing/i);
  const failingMatch = output.match(/(\d+)\s+failing/i);
  if (passingMatch || failingMatch) {
    return {
      passed: parseInt(passingMatch?.[1] ?? "0", 10),
      failed: parseInt(failingMatch?.[1] ?? "0", 10),
    };
  }

  // Fallback: infer from exit code
  return exitCode === 0 ? { passed: 1, failed: 0 } : { passed: 0, failed: 1 };
}
