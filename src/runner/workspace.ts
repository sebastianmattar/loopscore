import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import type { SetupConfig, Task } from "../types.js";

/**
 * Creates a fresh isolated workspace for a single run:
 *   1. Allocates a temp directory
 *   2. git init + empty initial commit (so git diff HEAD works later)
 *   3. Writes requirements.md
 *   4. Copies any setup files (skills, agents.md, mcp.json)
 */
export function createWorkspace(task: Task, setup?: SetupConfig): string {
  const workspacePath = fs.mkdtempSync(
    path.join(os.tmpdir(), `loopscore-${task.id}-`),
  );

  // Init git with a silent empty commit so we can diff later
  execSync("git init", { cwd: workspacePath, stdio: "ignore" });
  execSync('git config user.email "loopscore@local"', {
    cwd: workspacePath,
    stdio: "ignore",
  });
  execSync('git config user.name "loopscore"', {
    cwd: workspacePath,
    stdio: "ignore",
  });
  execSync('git commit --allow-empty -m "init"', {
    cwd: workspacePath,
    stdio: "ignore",
  });

  // Write requirements.md (task prompt + body)
  const requirementsContent = buildRequirementsContent(task);
  fs.writeFileSync(
    path.join(workspacePath, "requirements.md"),
    requirementsContent,
    "utf-8",
  );

  // Copy optional setup files
  if (setup) {
    copySetupFiles(workspacePath, setup);
  }

  return workspacePath;
}

function buildRequirementsContent(task: Task): string {
  const lines: string[] = [`# ${task.title}`, "", task.prompt];
  if (task.body) {
    lines.push("", task.body);
  }
  return lines.join("\n");
}

function copySetupFiles(workspacePath: string, setup: SetupConfig): void {
  if (setup.skillsDir && fs.existsSync(setup.skillsDir)) {
    const dest = path.join(workspacePath, ".github", "skills");
    fs.mkdirSync(dest, { recursive: true });
    copyDir(setup.skillsDir, dest);
  }

  if (setup.agentsMd && fs.existsSync(setup.agentsMd)) {
    const dest = path.join(workspacePath, ".github", "agents.md");
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(setup.agentsMd, dest);
  }

  if (setup.mcpJson && fs.existsSync(setup.mcpJson)) {
    const dest = path.join(workspacePath, ".mcp.json");
    fs.copyFileSync(setup.mcpJson, dest);
  }
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/** Cleans up the temporary workspace directory */
export function cleanWorkspace(workspacePath: string): void {
  fs.rmSync(workspacePath, { recursive: true, force: true });
}
