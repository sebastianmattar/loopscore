# Agent Bench — Implementation Plan

## Phase 1 – Scaffold

- [x] Init TypeScript/Node.js project (`npm init`, `tsconfig.json`, eslint)
- [x] Set up CLI entry point using `commander`
- [x] Define core types: `Task`, `AgentConfig`, `RunResult`, `BenchConfig`, `ScoringConfig`

## Phase 2 – Task Loading

- [x] Parse `.md` task files with YAML frontmatter (`gray-matter`)
- [x] Validate frontmatter schema (`id`, `title`, `prompt`, `model_params`, `acceptance_criteria[]`, `scoring.methods[]`, `scoring.tests_cmd`)

## Phase 3 – Run Lifecycle

- [x] Workspace manager: create temp dir → `git init` → copy setup files + `requirements.md`
- [x] Define agent adapter interface (plugin pattern: `src/agents/`, auto-discovered)
- [x] `gh copilot` adapter (agentic mode)
- [x] `kiro` adapter (agentic CLI)
- [x] Subprocess runner: spawn agent, capture stdout/stderr, measure wall-clock time

## Phase 4 – Metrics

- [x] Time metric (wall-clock ms around subprocess)
- [x] Line count metric (`git diff --numstat` after run)
- [x] Complexity metric (`escomplex` / `ts-complexity` on generated files)
- [x] Token count metric (`tiktoken` JS port or parsed from agent stdout)

## Phase 5 – Scoring

- [x] LLM-as-judge scorer: configurable provider, GitHub Copilot as default; structured output (score 0–1 + reasoning per acceptance criterion)
- [x] Test runner scorer: execute `tests_cmd` in workspace, capture pass/fail ratio
- [x] Manual scorer: flag run as pending; `bench review <run-id>` command

## Phase 6 – Persistence

- [x] Write `runs/{timestamp}-{task-id}-{agent}/run-N.json` per attempt
- [x] Write `runs/{...}/summary.json` with aggregated stats across N runs

## Phase 7 – CLI Commands

- [x] `bench run <task-id> [--agent <name>] [--runs N] [--config <path>]`
- [x] `bench run-all [--agent <name>] [--config <path>]`
- [x] `bench report <run-set-id>`
- [x] `bench compare <id> <id> [...]`
- [x] `bench list runs` / `bench list tasks`
- [x] `bench review <run-id>`

## Phase 8 – Config

- [x] `bench.config.json` schema + loader (agent list with CLI invocations, model params, setup paths, default run count, judge provider + credentials)

---

## Decisions

- TypeScript/Node.js, CLI only
- Agentic mode only — no suggestion/chat wrappers
- Plugin pattern for agents (`src/agents/`) — new agent = one new file implementing the interface
- Initial agents: `gh copilot` + `kiro`
- LLM-as-judge: configurable provider, GitHub Copilot as default
- JSON-per-run persistence under `runs/`
- Default 3 runs per config (configurable)
- Fresh `git init` temp directory per run for isolation
