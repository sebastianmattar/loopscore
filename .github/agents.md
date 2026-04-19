# loopscore — Agent Guide

CLI tool to benchmark agentic coding AIs against coding tasks.

## Stack

- TypeScript / Node.js (ESM, `"type": "module"`)
- pnpm, commander v14, chalk v5, zod v4
- Build: `pnpm build` (tsc); Dev: `pnpm dev`

## Project Structure

```
src/
  index.ts              Entry point, wires up CLI
  cli.ts                All commands (run, run-all, report, compare, scoreboard, list, review)
  config.ts             Loads bench.config.json; Zod schema for BenchConfig
  types.ts              All shared TypeScript interfaces
  tasks.ts              Loads .md task files with gray-matter frontmatter
  metrics.ts            Collects run metrics (time, line count, complexity, tokens, cost)
  persistence.ts        Reads/writes run JSON, summaries, agent logs, workspace snapshots
  report.ts             Formats output: report, compare, scoreboard (terminal + markdown)
  agents/
    index.ts            Registry: maps agent name → AgentAdapter; getAdapter(), getAgentVersion()
    base.ts             createSubprocessAdapter() factory; getAgentVersion() utility
    copilot.ts          GitHub Copilot CLI adapter (gh-copilot)
    gemini.ts           Google Gemini CLI adapter
    claude.ts           Anthropic Claude Code CLI adapter
    kiro.ts             Kiro adapter
  runner/
    index.ts            runOnce() + runTask() — orchestrates workspace→agent→metrics→score→persist
    subprocess.ts       spawnAgent() — spawns agent CLI, captures stdout/stderr
    workspace.ts        createWorkspace() — git init, writes requirements.md, copies setup files
  scorers/
    index.ts            scoreRun() — dispatches to llm-judge, tests, manual
    llm-judge.ts        LLM judge via copilot/openai/anthropic
    test-runner.ts      Runs tests_cmd and parses pass/fail
    manual.ts           Creates pending manual review placeholder

agents/                 Agent definition files (*.agent.json)
  gh-copilot.agent.json
  gemini.agent.json
  claude.agent.json
  kiro.agent.json (if present)

tasks/                  Task definitions (*.md with YAML frontmatter)
runs/                   Output: per-run JSON, summaries, logs, workspace snapshots
bench.config.json       Active benchmark configuration
```

## Key Conventions

- All relative imports use `.js` extensions (ESM requirement)
- Agent args support template variables: `{requirementsContent}`, `{requirementsFile}`, `{workspacePath}`, `{prompt}`
- `AgentAdapter` must implement `healthcheck(config)` and `invoke(workspacePath, task, config)`
- Run sets are keyed by `{timestamp}-{taskId}-{agentName}`
- Scores are in the 0–1 range; `overall` is the mean of all scoring methods used
