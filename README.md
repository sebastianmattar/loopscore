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

```

```

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
- **Authentication:** Agents must be pre-authenticated. You can manage API keys and secrets using a standard `.env` file if you need to.
