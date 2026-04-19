import fs from "fs";
import matter from "gray-matter";
import path from "path";
import { z } from "zod";
import type { Task } from "./types.js";

const TaskFrontmatterSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  model_params: z.record(z.string(), z.unknown()).optional(),
  acceptance_criteria: z.array(z.string()).min(1),
  scoring: z
    .object({
      methods: z.array(z.enum(["llm-judge", "tests", "manual"])).optional(),
      tests_cmd: z.string().optional(),
    })
    .optional(),
});

export function loadTask(filePath: string): Task {
  const absolutePath = path.resolve(filePath);
  const content = fs.readFileSync(absolutePath, "utf-8");
  const { data, content: body } = matter(content);

  const parsed = TaskFrontmatterSchema.parse(data);
  return {
    ...parsed,
    body: body.trim(),
    filePath: absolutePath,
  };
}

export function loadTasks(tasksDir: string): Task[] {
  const absoluteDir = path.resolve(tasksDir);

  if (!fs.existsSync(absoluteDir)) {
    throw new Error(`Tasks directory not found: ${absoluteDir}`);
  }

  const files = fs
    .readdirSync(absoluteDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(absoluteDir, f));

  return files.map(loadTask);
}

export function findTask(tasksDir: string, taskId: string): Task {
  const tasks = loadTasks(tasksDir);
  const found = tasks.find((t) => t.id === taskId);
  if (!found) {
    throw new Error(
      `Task "${taskId}" not found in ${tasksDir}. Available: ${tasks.map((t) => t.id).join(", ")}`,
    );
  }
  return found;
}
