---
name: create-loopscore-benchmark
description: "Create benchmark config files for loopscore using bench-config.schema.json. Use when designing new benchmark variants, judge criteria, or shell-based scoring checks."
argument-hint: "What should this benchmark evaluate?"
user-invocable: true
---

# Create Benchmark

Create or update a benchmark config that is valid for this repository and aligned with the expected schema and patterns.

## When to Use

- You want a new benchmark config file for agent-bench.
- You want to add or refine variants for an existing benchmark.
- You want to add acceptance criteria and scoring checks.

## Inputs To Collect

1. Benchmark objective (what capability to evaluate).
2. Task requirements content that will be placed into setup files.
3. Target agents and variants to compare.
4. Judge rubric and shell checks.
5. Run options (runCount, parallel, outputDir).

## Required References

- Schema: bench-config.schema.json
- Example: benchmarks/caveman-skill.config.yaml

## Procedure

1. Choose output path.

- Prefer benchmarks/<benchmark-name>.config.yaml.
- Use a descriptive benchmark name that maps to the file name.

2. Start from the minimum valid shape.

- Create top-level keys: options, variantDefaults, variants, measure.
- Ensure variants and measure are always present.

3. Define global defaults in variantDefaults.

- Set variantDefaults.agent.type (for example: copilot or gemini).
- Put shared setup files in variantDefaults.setup.files.
- Put shared pre/post commands in variantDefaults.commands only if all variants need them.

4. Define variants as isolated comparisons.

- Each variant must include name.
- Put per-variant prompts in query as an ordered list.
- Put variant-specific setup or commands only on that variant.
- Keep variants comparable: same task objective, only intended differences.

5. Define judge scoring.

- Add a judge measure item:
  - type: judge
  - provider: copilot or gemini
  - model: optional
  - acceptanceCriteria: explicit, testable statements.
- Write criteria as observable outcomes, not implementation preferences.

6. Define shell scoring checks.

- Add one or more shell measure items:
  - type: shell
  - name, command, scoreIfPasses, scoreIfFails.
- Prefer deterministic checks (build, tests, file presence, lint where applicable).
- Keep score magnitudes intentional and explainable.

7. Validate consistency.

- Verify each command is runnable in the generated workspace context.
- Confirm scoring balance (judge + shell) matches benchmark intent.
- Ensure schema compatibility with bench-config.schema.json.

8. Final quality pass.

- Remove contradictory criteria.
- Ensure variants differ only by intended experimental variable.
- Confirm wording is clear enough for repeatable evaluation.

## Decision Points

- Judge provider:
  - Use copilot when aligning with existing default workflow.
  - Use gemini when explicitly comparing against Gemini judging.
- Variant granularity:
  - Use 2 variants for direct A/B comparisons.
  - Use more only when each added variant answers a separate hypothesis.
- Shell checks:
  - Use positive checks for required behavior.
  - Use negative checks sparingly for prohibited outcomes.

## Completion Criteria

- Config conforms to bench-config.schema.json.
- At least one variant and one measure entry exist.
- Judge acceptance criteria are concrete and verifiable.
- Shell checks are deterministic and meaningful.
- File is saved in benchmarks/ with a clear benchmark-oriented name.

## Output Contract

Produce:

1. A complete YAML config file that must validate against the schema.
2. A short rationale describing:

- why each variant exists,
- how scores are weighted conceptually,
- what result would indicate a better agent outcome.
