# loopscore - naive benchmark for AI agents

A CLI tool to do naive benchmarks of different agentic coding agents, models, skills and configurations.

## Motivation

Trying to figure out which model suits best to your requirements?

Not sure if your new AGENTS.md performs better than the old one?

Is that MCP really improving output?

This is a simple tool that can run the same set of commands with different agentic environments. It will record the output and perform a simple evaluation:

- Tokens / Time taken
- Lines of code
- Complexity
- Fulfilling the requirements (we are using an agentic judge for this)

## Caveats

Like with everything LLM the results must be taken with a grain of salt:

- Results can randomly vary due to different seeds, hardware and other factors
- Some providers may reduce thinking budgets due to load
- Models may be updated
- System prompts can be updated
- The LLM judge looking at the run output is an LLM and therefore unreliable

## Prerequisites

- Node.js 22+
- pnpm 10+
- Agent CLIs you want to test installed and on `$PATH` (e.g. `copilot`, `gemini`, `claude`)
- For LLM-as-judge scoring: the `copilot` CLI (default, no API key needed), or `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` for other providers

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

`bench.config.json` in the project root:

```json
{
  "agents": ["gh-copilot"],
  "agentsDir": "./agents",
  "defaultRuns": 3,
  "runsDir": "./runs",
  "tasksDir": "./tasks",
  "judge": {
    "provider": "copilot"
  }
}
```

**`agents`** — array of agent names (strings) referencing files in `agentsDir`, or inline agent objects:

```json
{
  "name": "my-agent",
  "cmd": "my-agent-cli",
  "args": ["-p", "{requirementsContent}"],
  "costPerMillionTokens": 3.0,
  "setup": {
    "skillsDir": "./setups/my-agent/skills",
    "agentsMd": "./setups/my-agent/agents.md",
    "mcpJson": "./setups/my-agent/mcp.json"
  }
}
```

**Agent arg template variables:**

| Variable                | Resolved value                                  |
| ----------------------- | ----------------------------------------------- |
| `{requirementsContent}` | Full text of `requirements.md` in the workspace |
| `{requirementsFile}`    | Absolute path to `requirements.md`              |
| `{workspacePath}`       | Absolute path to the workspace root             |
| `{prompt}`              | Raw task prompt string                          |

**Judge providers:** `copilot` (default), `openai` (requires `OPENAI_API_KEY`), `anthropic` (requires `ANTHROPIC_API_KEY`).

## Agent Files

Agent definitions live in `agents/*.agent.json`:

```json
{
  "name": "gh-copilot",
  "cmd": "copilot",
  "args": [
    "-p",
    "{requirementsContent}",
    "--allow-all-tools",
    "--allow-all-paths",
    "--output-format",
    "json",
    "--config-dir",
    "{workspacePath}"
  ],
  "model_params": {}
}
```

Built-in adapters: `gh-copilot`, `gemini`, `claude`, `kiro`. Any agent with `cmd` + `args` in its config file works without a dedicated adapter.

## Defining Tasks

Tasks live in `tasks/` as `.md` files with YAML frontmatter:

```markdown
---
id: my-task
title: My Benchmark Task
prompt: |
  Implement a REST API with a /health endpoint in TypeScript.
acceptance_criteria:
  - The server starts without errors
  - GET /health returns 200
scoring:
  methods:
    - llm-judge
    - tests
  tests_cmd: npm test
---

## Additional Context

Any extra detail for the agent.
```

**Frontmatter fields:**

| Field                 | Required | Description                                              |
| --------------------- | -------- | -------------------------------------------------------- |
| `id`                  | ✓        | Unique task identifier                                   |
| `title`               | ✓        | Human-readable title                                     |
| `prompt`              | ✓        | Instruction given to the agent                           |
| `acceptance_criteria` | ✓        | Criteria used for LLM judge scoring                      |
| `scoring.methods`     |          | `llm-judge`, `tests`, `manual` — defaults to `llm-judge` |
| `scoring.tests_cmd`   |          | Shell command run inside the workspace to execute tests  |
| `model_params`        |          | Per-task model parameters                                |

## CLI Commands

### `loopscore run <task-id>`

Run a single task. Each attempt gets a fresh isolated git workspace.

```sh
loopscore run hello-world-api
loopscore run hello-world-api --agent copilot --runs 3
loopscore run hello-world-api --force          # ignore dedup check
loopscore run hello-world-api --config path/to/bench.config.json
```

| Flag                  | Default                   | Description                              |
| --------------------- | ------------------------- | ---------------------------------------- |
| `-a, --agent <name>`  | all configured agents     | Run with a single specific agent         |
| `-n, --runs <number>` | `defaultRuns` from config | Number of attempts per agent             |
| `-f, --force`         | off                       | Run even if enough results already exist |
| `-c, --config <path>` | `./bench.config.json`     | Path to config file (global flag)        |

### `loopscore run-all`

Run every task in the tasks directory for every configured agent.

```sh
loopscore run-all
loopscore run-all --agent gemini --runs 1 --force
```

Supports the same `-a`, `-n`, `-f`, `-c` flags as `run`.

### `loopscore report [run-set-id]`

Show metrics and scores for a run set.

```sh
loopscore report 2026-04-19T12-00-00-hello-world-api-copilot
loopscore report --all
```

### `loopscore compare <id> <id> [...]`

Side-by-side comparison of run sets.

```sh
loopscore compare \
  2026-04-19T12-00-00-hello-world-api-copilot \
  2026-04-19T12-10-00-hello-world-api-gemini
```

### `loopscore scoreboard`

Ranked overview of all run sets.

```sh
loopscore scoreboard
loopscore scoreboard --markdown   # output as Markdown table
```

### `loopscore list runs` / `loopscore list tasks`

List all run set IDs or available tasks.

### `loopscore review <run-set-id>`

Interactively enter manual scores for runs pending review (when `manual` is in `scoring.methods`).

## Metrics

| Metric                    | How it's measured                                       |
| ------------------------- | ------------------------------------------------------- |
| **Time**                  | Wall-clock milliseconds for the agent subprocess        |
| **Lines added**           | `git diff HEAD --numstat`, code files only              |
| **Est. tokens**           | Characters in generated source files ÷ 4                |
| **Cyclomatic complexity** | Average per-file complexity via TypeScript AST analysis |
| **Est. cost (USD)**       | Tokens × `costPerMillionTokens` ÷ 1 000 000             |

## Scoring

| Method        | Description                                             |
| ------------- | ------------------------------------------------------- |
| **llm-judge** | LLM scores each acceptance criterion 0–1 with reasoning |
| **tests**     | Runs `tests_cmd` in the workspace; score = pass rate    |
| **manual**    | Run is flagged pending; score via `loopscore review`    |

The **overall score** is the unweighted mean of all available method scores (0–1).

## Run Deduplication

`run` and `run-all` skip a configuration if a sufficient number of completed runs already exist for the same `(taskId, agentName, agentVersion)` tuple. Use `--force` / `-f` to override.

## Persistence

```
runs/
  {timestamp}-{task-id}-{agent}/
    run-1.json               ← individual result + full stdout/stderr
    run-2.json
    summary.json             ← aggregated stats (mean/min/max/stddev)
    run-1-stdout.log
    run-1-stderr.log
    run-1-judge.md           ← human-readable judge notes
    run-1-workspace/         ← snapshot of the generated code
```

## Adding a New Agent

1. Create `agents/my-agent.agent.json`:

```json
{
  "name": "my-agent",
  "cmd": "my-agent-cli",
  "args": ["-p", "{requirementsContent}", "--yes"],
  "model_params": {}
}
```

2. Reference it in `bench.config.json`:

```json
{ "agents": ["my-agent"] }
```

For custom healthcheck or invocation logic, add `src/agents/my-agent.ts` and register it in `src/agents/index.ts`.
