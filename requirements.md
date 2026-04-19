# Agent Bench — Requirements

A CLI tool to benchmark different agentic coding AIs against coding tasks, producing comparable, reproducible results.

## Stack

- TypeScript / Node.js
- CLI only (no web UI)

## Tasks

- Tasks are `.md` files with YAML frontmatter stored in a `tasks/` directory
- Frontmatter fields: `id`, `title`, `prompt`, `model_params`, `acceptance_criteria[]`, `scoring.methods[]`, `scoring.tests_cmd`
- Task body provides additional context / requirements to the agent

## Comparison Parameters

- Agent (e.g. `gh copilot`, `kiro`)
- Model
- Model parameters
- Setup configuration (skills, `agents.md`, MCP config)

## Agent Execution

- Agents are invoked in **agentic mode** as CLI subprocesses
- Each run gets a fresh, isolated temp directory with `git init`
- Setup files are copied into the workspace before the agent runs
- Plugin pattern: adding a new agent = one new file in `src/agents/` implementing the adapter interface
- Initial agents: `gh copilot`, `kiro`

## Metrics

- **Time**: wall-clock duration of the agent subprocess
- **Token count**: parsed from agent output or estimated via tokenizer
- **Line count**: lines added/changed via `git diff --numstat`
- **Complexity**: cyclomatic complexity of generated files

## Scoring (configurable per task)

- **LLM-as-judge**: score 0–1 per acceptance criterion with reasoning; provider configurable, GitHub Copilot as default
- **Test runner**: executes `tests_cmd` in the workspace, captures pass/fail ratio
- **Manual**: flags run as pending review; entered via `bench review <run-id>`

## Persistence

- Results stored as JSON files under `runs/`
- Structure: `runs/{timestamp}-{task-id}-{agent}/run-N.json` + `summary.json`
- Default 3 runs per agent/task/config combination (configurable)

## Configuration

- `bench.config.json`: agent list with CLI invocations, model params, setup paths, default run count, judge provider + credentials

## CLI Commands

- `bench run <task-id> [--agent <name>] [--runs N] [--config <path>]`
- `bench run-all [--agent <name>] [--config <path>]`
- `bench report <run-set-id>`
- `bench compare <id> <id> [...]`
- `bench list runs` / `bench list tasks`
- `bench review <run-id>`
