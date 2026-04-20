# V1.10 Implementation Plan

## 1. Write summary markdown after a run

**Goal:** After the `run` command finishes all variants, write a scoreboard markdown file into the bench directory (e.g. `./results/bench/summary.md`) so a human (or CI) can open it without running the `scoreboard` command.

**Design:**

- The `outputDir` (already set to `<configuredDir>/<benchName>`) is the bench directory.
- After all variants finish, collect the `RunSetSummary` for each just-completed run set using `readSummary`, then call the existing `formatScoreboardMarkdown` and write the result to `<outputDir>/summary.md`.

**Changes:**

- [ ] **`src/cli.ts`**: in the `run` command action, after `Promise.allSettled` / sequential loop:
  1. Collect the `runSetId` values produced by each variant run. Extract them from the closure or have `runAgentWithSpinner` / `runAgentParallel` return `string | null` (the run set id, or null if skipped).
  2. For each returned `runSetId`, call `readSummary(runSetId, config.outputDir)` to get the `RunSetSummary`.
  3. Call `formatScoreboardMarkdown(summaries)` and write to `path.join(config.outputDir, "summary.md")`.
  4. Print a confirmation line, e.g. `chalk.gray("  Summary: <path>")`.

- [ ] **`src/cli.ts`**: change `runAgentWithSpinner` and `runAgentParallel` return type from `Promise<void>` to `Promise<string | null>` so they return the `runSetId` (or `null` when skipped).

No changes needed to `report.ts`, `persistence.ts`, or `types.ts` — all building blocks already exist.

---

## 2. Extend judging with custom shell-command checks

**Goal:** Allow the config to define named checks (shell commands) that run in the agent workspace after the agent finishes. Each check contributes a fixed score on pass or fail. Results are combined with the LLM-judge score in the overall.

**New config shape (per variant, also supported in `variantDefaults`):**

```yaml
checks:
  - name: "Unit tests pass"
    command: "npm test"
    scoreIfPasses: 1.0
    scoreIfFails: 0.0
  - name: "No lint errors"
    command: "npm run lint"
    scoreIfPasses: 0.5
    scoreIfFails: -0.25
```

**Changes:**

- [ ] **`src/types.ts`**: add new `CheckConfig` interface:

  ```ts
  export interface CheckConfig {
    name: string;
    command: string;
    scoreIfPasses: number;
    scoreIfFails: number;
  }
  ```

  Add `checks?: CheckConfig[]` to `VariantConfig` and `VariantDefaults`.

- [ ] **`src/config.ts`**: add `CheckConfigSchema`:

  ```ts
  const CheckConfigSchema = z.object({
    name: z.string(),
    command: z.string(),
    scoreIfPasses: z.number(),
    scoreIfFails: z.number(),
  });
  ```

  Add `checks: z.array(CheckConfigSchema).optional()` to `VariantDefaultsSchema` and `VariantConfigSchema`.

- [ ] **`src/runner/index.ts`**: merge checks from defaults + variant (same pattern as commands), pass the merged list to `scoreRun` as a new parameter:

  ```ts
  const mergedChecks = [
    ...(benchConfig.variantDefaults?.checks ?? []),
    ...(variant.checks ?? []),
  ];
  ```

  Update the `scoreRun` call to pass `mergedChecks`.

- [ ] **`src/scorers/index.ts`**: add `runChecks(checks: CheckConfig[], workspacePath: string): TestResult` function:
  - For each check: run the command in `workspacePath` via `execSync` (catch errors as failures).
  - A check passes if the command exits with code 0.
  - Collect `passed`, `failed`, `total`; compute `score` as the sum of each check's `scoreIfPasses` / `scoreIfFails` normalized to [0, 1] (or simply the average contribution: `sum / total` where each contribution is `scoreIfPasses` or `scoreIfFails`).
  - Capture combined stdout/stderr of all checks as `output`.
  - Update `scoreRun` signature to accept `checks?: CheckConfig[]`, call `runChecks` when checks are provided, and assign to `output.tests`.
  - The existing `computeOverall` already averages `llmJudge` and `tests` together — no change needed there.

- [ ] **`src/persistence.ts`** / **`src/types.ts`**: `TestResult` already has `passed/failed/total/score/output` — no structural changes needed.
