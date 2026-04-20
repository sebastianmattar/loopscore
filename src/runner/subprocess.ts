import { spawn } from "child_process";
import type { AgentInvokeResult } from "../types";

/**
 * Spawns an agent CLI subprocess in the given working directory.
 * Captures stdout/stderr and measures wall-clock time.
 */
export function spawnAgent(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<AgentInvokeResult> {
  return new Promise((resolve, reject) => {
    const startedAt = new Date();

    const child = spawn(cmd, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn agent "${cmd}": ${err.message}`));
    });

    child.on("close", (exitCode) => {
      const completedAt = new Date();
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8"),
        exitCode,
        startedAt,
        completedAt,
      });
    });
  });
}
