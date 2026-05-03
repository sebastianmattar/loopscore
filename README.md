# loopscore

### A Naive Benchmark for AI Coding Agents

**loopscore** is a CLI-based evaluation tool designed for developers who need a "gut check" on their agentic workflows. It automates the process of running identical tasks across different agent configurations to see which one actually ships working code and which one just burns tokens.

---

## 🎯 Why Run loopscore?

In the rapidly evolving AI landscape, "vibes-based" testing eventually hits a wall. You need this tool if you are:

- **Benchmarking Models:** Comparing if `Claude 3.5 Sonnet` truly outperforms `GPT-4o` for your specific codebase.
- **Prompt Engineering:** Testing if a new `AGENTS.md` or system instructions actually improve logic or just change the coding style.
- **Tooling ROI:** Evaluating if adding a **Model Context Protocol (MCP)** provides a measurable lift in quality or simply adds latency.

---

## Example

**Question:** Does the caveman skill save tokens without compromising quality?
Let's find out with an artificial benchmark!

```bash
npx @sebastianmattar/loopscore init # initialize the current directory with config and presets
npx @sebastianmattar/loopscore run benchmarks/caveman-skill.bench.yaml # Execute the test
```

This will generate a `benchmarks/results` directory containing details of all runs as well as a `summary.md`. This is the relevant table:

| Agent   | Variant         | Model   | Overall | LLM Judge | Checks | Time (s) | Tokens | Lines | Est. cost | Runs |
| ------- | --------------- | ------- | ------: | --------: | -----: | -------: | -----: | ----: | --------- | ---: |
| copilot | without-caveman | gpt-5.4 |   5.450 |     0.900 | 10.000 |  164.28s |    557 |   170 | $0.0056   |    1 |
| copilot | with-caveman    | gpt-5.4 |   5.435 |     0.870 | 10.000 |  133.70s |    194 |   114 | $0.0019   |    1 |

**Answer:** Caveman runs faster, requires less tokens (cheaper) but has worse quality - interesting!

---

## ⚙️ How It Works

The tool executes a standardized set of commands across multiple **agentic environments**. Once the agents complete their tasks, `loopscore` aggregates the data and runs an evaluation suite:

For each run the process is as follows:

#### 1. Set up workspace

- Inject files such as (AGENTS.md, REQUIREMENTS.md)
- Execute commands to install _Skills_ etc.

#### 2. Perform benchmark

- Start an agent with your query

#### 3. Judge

The generated results will be analyzed according to the following metrics.

| Metric               | Description                                                                                              |
| :------------------- | :------------------------------------------------------------------------------------------------------- |
| **Efficiency**       | Total tokens consumed vs. wall-clock time taken. (Lower is better)                                       |
| **Output Volume**    | Lines of code (LOC) generated to solve the problem. (Lower is better)                                    |
| **Code Complexity**  | Structural analysis of the resulting code. (Lower is better)                                             |
| **Requirement Fit**  | An **Agentic Judge** reviews the output against the original prompt to score success. (Higher is better) |
| **Shell Test Cases** | You can run run shell commands and evaluate the return code to generate a score. (Higher is better)      |

---

## ⚠️ Important Caveats

Benchmark results in the LLM world should be used with caution. Keep the following in mind:

- **Benchmarking Complexity:** Creating realistic benchmarks is very hard. Models get worse with larger contexts, simple benchmarks without user interaction are very limited.
- **Environmental Noise:** Results vary due to hardware, seed randomness, and provider-side load balancing.
- **Provider Variability:** API providers often adjust "thinking budgets" or update system prompts without notice, and caching can mask variance.
- **"Benchmaxxing":** Some models are fine-tuned specifically to score high on public benchmarks and common frameworks, but may falter in messy, real-world repositories.
- **Judge Subjectivity:** The "LLM Judge" is itself an LLM, making it susceptible to the same hallucinations and biases as the agents it evaluates.
- **Agent Awareness:** Agents may get aware that they are being benchmarked and therefore behave differently

---

## 🛠 Prerequisites

To get started, ensure your environment meets these requirements:

- **OS**: Anything common and unix-based: macOS, Linux or WSL
- **Runtime:** Node.js **22+**
- **Agent Access:** Target Agent CLIs (e.g., `copilot`, `gemini`, `claude`) must be installed and accessible via your `$PATH`.

  Currently supported:
  - GitHub Copilot
  - Google Gemini
  - OpenCode

- **Authentication:** Agents must be pre-authenticated. You can manage API keys and secrets using a standard `.env` file in your local directory if you need to.

---

## 🚀 Getting Started

Initialize a workspace with the schema, VS Code YAML settings, starter skill, and example benchmark:

```bash
npx loopscore init
```

Then run a bundled example benchmark:

```bash
npx loopscore run benchmarks/caveman-skill.bench.yaml
```

There is also a dedicated OpenCode example benchmark:

```bash
npx loopscore run benchmarks/opencode.bench.yaml
```

## Providers

loopscore currently supports these built-in agent providers:

- `copilot`
- `gemini`
- `opencode`

### OpenCode Example

You can add an `opencode` variant by overriding the agent on a single benchmark variant:

```yaml
variants:
  - name: copilot-baseline
    query:
      - Implement requirements.md

  - name: opencode-baseline
    agent:
      type: opencode
      model: github-copilot/gpt-5.4
      options:
        agent: build
        variant: high
    query:
      - Implement requirements.md
```

OpenCode runs through `opencode run ... --format json` and supports headless benchmark execution.

### OpenCode Options

The `opencode` provider supports these `agent.options` fields:

- `agent`
- `continue`
- `session`
- `fork`
- `share`
- `file`
- `title`
- `attach`
- `password`
- `dir`
- `port`
- `variant`
- `thinking`
- `dangerouslySkipPermissions`
- `command`
- `pure`
- `logLevel`
- `printLogs`

The `model` field for `opencode` should use the CLI's `provider/model` format. The exact provider IDs depend on what your local OpenCode install exposes, so check them with `opencode models`. On this machine, valid examples include `github-copilot/gpt-5.4` and `opencode/gpt-5-nano`.

## Pricing

If your agent CLI exposes real input and output token usage, loopscore can estimate cost from explicit model pricing instead of the older flat token heuristic.

Example:

```yaml
variantDefaults:
  agent:
    type: copilot
    model: gpt-5
    pricing:
      inputCostPerMillionTokens: 1.25
      outputCostPerMillionTokens: 10.0

measure:
  - type: judge
    provider: copilot
    model: gpt-5
    acceptanceCriteria:
      - Builds and runs
```

If `pricing` is present on the benchmarked agent and token usage is available, loopscore computes run cost from real input and output tokens. If not, it falls back to the legacy `costPerMillionTokens` setting and the existing token estimate heuristic.
