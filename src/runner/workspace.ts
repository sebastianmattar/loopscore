import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import type { SetupConfig, VariantConfig } from "../types";

/**
 * Creates a fresh isolated workspace for a single run:
 *   1. Allocates a temp directory
 *   2. git init + empty initial commit (so git diff HEAD works later)
 *   3. Writes requirements.md from setup.query
 *   4. Writes any additional files defined in setup.files
 */
export function createWorkspace(
  variant: VariantConfig,
  setup?: SetupConfig,
): string {
  const workspacePath = fs.mkdtempSync(
    path.join(os.tmpdir(), `loopscore-${variant.name}-`),
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

  // Write .gitignore so generated dirs are never staged or counted
  fs.writeFileSync(
    path.join(workspacePath, ".gitignore"),
    [
      "node_modules/",
      "dist/",
      "build/",
      "out/",
      ".next/",
      ".nuxt/",
      "coverage/",
      "vendor/",
      "__pycache__/",
      "*.pyc",
      ".cache/",
      "target/",
      ".venv/",
      "venv/",
      "session-state/",
      "logs/",
      "package-lock.json",
    ].join("\n") + "\n",
    "utf-8",
  );

  execSync('git commit --allow-empty -m "init"', {
    cwd: workspacePath,
    stdio: "ignore",
  });
  // Tag the baseline so we can always diff against it, even if the agent commits
  execSync("git tag loopscore-baseline", {
    cwd: workspacePath,
    stdio: "ignore",
  });

  // Write additional files defined in setup.files
  for (const [relPath, content] of Object.entries(setup?.files ?? {})) {
    const dest = path.join(workspacePath, relPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, "utf-8");
  }

  return workspacePath;
}

/** Cleans up the temporary workspace directory */
export function cleanWorkspace(workspacePath: string): void {
  fs.rmSync(workspacePath, { recursive: true, force: true });
}
