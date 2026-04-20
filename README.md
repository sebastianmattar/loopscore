# loopscore - naive benchmark for AI agents

This is a CLI tool to do naive comparisons of different agentic coding agent configurations.

## Motivation

- Trying to figure out which model suits best to your requirements?
- Not sure if your new AGENTS.md performs better than the old one?
- Is that MCP really improving quality of result?

This is a simple tool that can run the same set of commands with different agentic environments. It will record the output and perform a simple evaluation:

- Tokens / Time taken
- Lines of code
- Complexity
- Fulfilling the requirements (we are using an agentic judge for this)

## Caveats

Like with everything LLM the results must be taken with a grain of salt:

- Results can randomly vary due to different seeds, hardware and other factors
- Some providers may reduce thinking budgets due to load leading to different outcomes
- Models may be updated (minor updates are not always communicated)
- System prompts can be updated
- Providers may use caching for similiar queries, reducing output variance
- Models may be tuned for benchmarking ("benchmaxxing") and not perform similar in real-world scenarios
- The LLM judge looking at the run output is an LLM and therefore unreliable

## Prerequisites

- Node.js 22+
- pnpm 10+
- Agent CLIs you want to test installed and on `$PATH` (e.g. `copilot`, `gemini`, `claude`)
- Agents must be authenticated, you can provide API Keys using the .env mechanism
