# V1.9 Implementation Plan

## 1. Fix before/after commands not being executed

**Root cause:** `runOnce` in `runner/index.ts` executes `variant.commands?.before/after` directly, but `variantDefaults.commands` is never merged in — so commands defined only in `variantDefaults` are silently ignored.

**Fix:**
- [ ] In `runOnce`, compute merged commands before running them:
  ```ts
  const before = [
    ...(benchConfig.variantDefaults?.commands?.before ?? []),
    ...(variant.commands?.before ?? []),
  ];
  const after = [
    ...(benchConfig.variantDefaults?.commands?.after ?? []),
    ...(variant.commands?.after ?? []),
  ];
  ```
- [ ] Replace steps 2 and 4 to iterate `before` / `after` instead of `variant.commands?.before/after`

## 2. Only run the remaining attempts, skip if quota reached

**Root cause:** `runAgentWithSpinner` / `runAgentParallel` check completed runs once before the whole batch and skip all runs. If e.g. 1 out of 3 runs already exists, it still skips everything instead of running the remaining 2.

**Fix:**
- [ ] In `runTask` (or at the top of `runOnce`), before each attempt check how many runs already exist for `(variantName, agentName, agentVersion)` in `runsDir`
- [ ] Calculate `remaining = requested - existingCount`; skip the loop entirely if `remaining <= 0`, otherwise only execute `remaining` iterations
- [ ] Remove the pre-batch skip check in `runAgentWithSpinner` and `runAgentParallel` (or keep it only as a fast-path when `remaining === 0`)
- [ ] Adjust the attempt numbering so new runs are numbered `existingCount + 1`, `existingCount + 2`, etc.

## 3. Update status display to show current task and LLM judge phase

**Root cause:** The spinner only shows `[N/M] running…` with elapsed time; it does not show which variant/task is being processed, and there is no indication when the LLM judge is running (which can take many seconds).

**Fix:**
- [ ] In `runAgentWithSpinner`, include the variant name in the spinner prefix or text, e.g. `[variant] [1/3] agent running… 12s`
- [ ] In `runOnce` (or `scoreRun`), emit a progress callback / event when judging starts so the caller can update the spinner text to `[variant] [1/3] judging…`
  - Add an optional `onJudgeStart?: () => void` callback to `RunOptions`
  - Call it just before `scoreRun` in `runOnce`
  - Wire it up in `runAgentWithSpinner` to update the spinner text

## 4. Take linecount baseline after variant setup

**Root cause:** The `loopscore-baseline` git tag is created in `createWorkspace` **before** setup files (`setup.files`, `requirements.md`) are written to the workspace. Those files therefore appear in `git diff loopscore-baseline HEAD` and inflate the line count.

**Fix:**
- [ ] In `createWorkspace` (`runner/workspace.ts`), move the `git tag loopscore-baseline` call to **after** all setup files have been written and staged:
  1. Write all setup files (requirements.md, setup.files entries) — already done
  2. `git add -A && git commit -m "setup"` to commit the setup files
  3. `git tag loopscore-baseline` — tag this point as the baseline
- [ ] Update the comment in `metrics.ts` (`measureLineCount`) to reflect that the baseline now includes setup files
