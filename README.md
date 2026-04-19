# agent-bench

A CLI tool to benchmark different agentic coding AIs against coding tasks, producing comparable, reproducible results.

## Prerequisites

- Node.js 22+
- pnpm 10+ (`npm install -g pnpm`)
- Agents you want to test installed and on `$PATH` (e.g. `copilot`, `kiro`)
- For LLM-as-judge scoring: the `copilot` CLI (default judge, pre-authenticated), or `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` for other providers

## Installation

```sh
pnpm install
pnpm build
```

Link the binary globally (optional):

```sh
pnpm link --global
```

Or run directly:

```sh
node dist/index.js <command>
```

## Configuration

Copy and edit `bench.config.json` in the project root:

```json
{
  "agents": [
    {
      "name": "gh-copilot",
      "cmd": "copilot",
      "args": ["agent", "--file", "{requirementsFile}"],
      "model": "gpt-4o",
      "model_params": {}
    },
    {
      "name": "kiro",
      "cmd": "kiro",
      "args": ["--task", "{requirementsFile}", "--yes"],
      "model": "claude-3-5-sonnet",
      "model_params": {}
    }
  ],
  "defaultRuns": 3,
  "runsDir": "./runs",
  "tasksDir": "./tasks",
  "judge": {
    "provider": "copilot",
    "model": "gpt-4o"
  }
}
```

**Agent args template variables:**

| Variable             | Resolved value                                      |
| -------------------- | --------------------------------------------------- |
| `{requirementsFile}` | Absolute path to `requirements.md` in the workspace |
| `{workspacePath}`    | Absolute path to the workspace root directory       |
| `{prompt}`           | Raw task prompt string                              |

**Judge providers:** `copilot` (default, uses the pre-authenticated `copilot` CLI — no API key needed), `openai` (requires `OPENAI_API_KEY`), `anthropic` (requires `ANTHROPIC_API_KEY`).

## Defining Tasks

Tasks live in the `tasks/` directory as `.md` files with YAML frontmatter:

```markdown
---
id: my-task
title: My Benchmark Task
prompt: |
  Implement a function that reverses a string in TypeScript.
model_params:
  temperature: 0.2
acceptance_criteria:
  - The function correctly reverses ASCII strings
  - The function handles empty strings
  - TypeScript compiles without errors
scoring:
  methods:
    - llm-judge # LLM evaluates against acceptance_criteria
    - tests # runs tests_cmd in the workspace
    - manual # flags run for manual review
  tests_cmd: npm test
---

## Additional Context

Any extra details or constraints for the agent go in the body.
```

**Frontmatter fields:**

| Field                 | Required | Description                                              |
| --------------------- | -------- | -------------------------------------------------------- |
| `id`                  | ✓        | Unique task identifier                                   |
| `title`               | ✓        | Human-readable title                                     |
| `prompt`              | ✓        | The instruction given to the agent                       |
| `acceptance_criteria` | ✓        | List of criteria used for scoring                        |
| `model_params`        |          | Per-task model parameters (merged with agent config)     |
| `scoring.methods`     |          | `llm-judge`, `tests`, `manual` — defaults to `llm-judge` |
| `scoring.tests_cmd`   |          | Shell command to run tests in the workspace              |

## Adding a New Agent

1. Create `src/agents/my-agent.ts`:

```typescript
import type { AgentAdapter } from "../types";
import { createSubprocessAdapter } from "./base";

const myAgent: AgentAdapter = createSubprocessAdapter("my-agent", [
  "--prompt",
  "{requirementsFile}",
  "--output",
  "{workspacePath}",
  "--yes",
]);

export default myAgent;
```

2. Register it in `src/agents/index.ts`:

```typescript
import myAgentAdapter from "./my-agent";

const BUILT_IN_ADAPTERS: Record<string, AgentAdapter> = {
  "gh-copilot": copilotAdapter,
  kiro: kiroAdapter,
  "my-agent": myAgentAdapter, // ← add here
};
```

3. Add the agent to `bench.config.json`:

```json
{
  "name": "my-agent",
  "cmd": "my-agent-cli",
  "model": "some-model"
}
```

Alternatively, any agent with `cmd` + `args` defined in `bench.config.json` works without a dedicated adapter file.

## CLI Commands

### `bench run <task-id>`

Run a single task. Each run gets a fresh isolated git workspace.

```sh
bench run hello-world-api
bench run hello-world-api --agent kiro
bench run hello-world-api --agent gh-copilot --runs 5
bench run hello-world-api --config path/to/bench.config.json
```

Options:

| Flag                  | Default                   | Description                    |
| --------------------- | ------------------------- | ------------------------------ |
| `-a, --agent <name>`  | all agents                | Run with a specific agent only |
| `-n, --runs <number>` | `defaultRuns` from config | Number of attempts             |
| `-c, --config <path>` | `./bench.config.json`     | Config file path               |

### `bench run-all`

Run every task in the tasks directory.

```sh
bench run-all
bench run-all --agent kiro --runs 1
```

### `bench report <run-set-id>`

Show metrics and scores for a completed run set.

```sh
bench report 2026-04-19T12-00-00-hello-world-api-kiro
```

Output:

```
  Run Set: 2026-04-19T12-00-00-hello-world-api-kiro
  Task:    hello-world-api
  Agent:   kiro
  Runs:    3

  Metric       Mean    Min   Max   StdDev
  Time (ms)    12400   9800  14200 ±1800
  Lines added  142     130   158   ±12
  Est. tokens  890     820   960   ±58
  Score (0–1)  0.867   0.8   0.93  ±0.065
```

### `bench compare <id> <id> [...]`

Side-by-side comparison of multiple run sets.

```sh
bench compare \
  2026-04-19T12-00-00-hello-world-api-kiro \
  2026-04-19T12-10-00-hello-world-api-gh-copilot
```

### `bench list runs`

List all run set IDs (newest first).

```sh
bench list runs
```

### `bench list tasks`

List all available tasks.

```sh
bench list tasks
```

### `bench review <run-set-id>`

Interactively enter manual scores for runs flagged as pending review (only relevant when `manual` is in the task's `scoring.methods`).

```sh
bench review 2026-04-19T12-00-00-hello-world-api-kiro
```

## Metrics

| Metric                    | How it's measured                                       |
| ------------------------- | ------------------------------------------------------- |
| **Time**                  | Wall-clock milliseconds for the agent subprocess        |
| **Lines added**           | `git diff HEAD --numstat` after the agent exits         |
| **Est. tokens**           | Total characters in generated source files ÷ 4          |
| **Cyclomatic complexity** | Average per-file complexity via TypeScript AST analysis |

## Scoring

| Method        | Description                                                |
| ------------- | ---------------------------------------------------------- |
| **llm-judge** | An LLM scores each acceptance criterion 0–1 with reasoning |
| **tests**     | Runs `tests_cmd` in the workspace; score = pass rate       |
| **manual**    | Run is flagged pending; you score it with `bench review`   |

The **overall score** is the unweighted average of all available method scores.

## Persistence

Results are stored as JSON under `runs/`:

```
runs/
  {timestamp}-{task-id}-{agent}/
    run-1.json          ← individual attempt result + full output
    run-2.json
    run-3.json
    summary.json        ← aggregated stats (mean/min/max/stddev)
```

## Setup Files (Skills / MCP / agents.md)

Per-agent setup files can be copied into each workspace automatically. Configure under an agent's `setup` key in `bench.config.json`:

```json
{
  "name": "gh-copilot",
  "cmd": "gh",
  "args": ["copilot", "agent", "--file", "{requirementsFile}"],
  "setup": {
    "skillsDir": "./setups/copilot/skills",
    "agentsMd": "./setups/copilot/agents.md",
    "mcpJson": "./setups/copilot/mcp.json"
  }
}
```

Files are copied to their conventional locations inside the workspace (`.github/skills/`, `.github/agents.md`, `.mcp.json`).
