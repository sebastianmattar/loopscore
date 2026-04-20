# V1.8 Implementation Plan

## 1. YAML config support

**Goal:** Replace JSON with YAML as the primary config format.

- [x] Add `yaml` npm package (`pnpm add yaml`)
- [x] Update `loadConfig` in `config.ts`:
  - [x] Parse `.yaml`/`.yml` files with `yaml.parse()` instead of `JSON.parse` + `stripJsonComments`
  - [x] Keep JSON support for backward compatibility (detect by file extension)
  - [x] Remove `strip-json-comments` dependency once JSON is no longer primary
- [x] Convert `bench.config.json` → `bench.config.yaml` (same structure, YAML syntax)
- [x] Update README examples

## 2. Write `SetupConfig.files` to workspace

**Goal:** Actually materialise the `files` map from `SetupConfig` as files in the temp workspace.

The `createWorkspace` function in `runner/workspace.ts` has a comment about writing setup files but does nothing.

- [x] Change `createWorkspace(variant)` signature to also accept the resolved `SetupConfig` (merged from `variantDefaults.setup` + `variant.setup`)
- [x] After git init, iterate `setup.files` and write each entry as `fs.writeFileSync(path.join(workspacePath, filename), content)`
- [x] Create parent directories as needed (`fs.mkdirSync(..., { recursive: true })`)
- [x] Update call sites in `runner/index.ts` to pass the merged setup

## 3. Inline prompt and acceptance criteria

**Goal:** Allow `prompt` and `acceptance_criteria` to live in `bench.config.yaml` rather than separate task markdown files.

**Current gap:** `setup.query` is the prompt and `benchConfig.acceptanceCriteria` are the criteria — both exist in the type system but neither is wired up end-to-end.

### 3a. Write `requirements.md` to workspace

- [x] In `createWorkspace` (same pass as feature 2), write `setup.query` as `requirements.md`

### 3b. Expand template variables in agent args

- [x] In `runner/subprocess.ts` (or `base.ts`), before spawning, replace in every arg:
  - [x] `{requirementsContent}` → value of `setup.query`
  - [x] `{requirementsFile}` → `path.join(workspacePath, "requirements.md")`
  - [x] `{workspacePath}` → `workspacePath`
- [x] Pass the needed values through from `runOnce`

### 3c. Surface `acceptanceCriteria` from variant/defaults

- [x] Add `acceptanceCriteria` to `VariantConfig` and `VariantDefaults` (types + Zod schemas) as `string[]` optional
- [x] In `runner/index.ts`, resolve effective criteria: `variant.acceptanceCriteria ?? defaults?.acceptanceCriteria ?? benchConfig.acceptanceCriteria`
- [x] Pass resolved criteria alongside `benchConfig` into `scoreRun` / LLM judge (or mutate a local copy of `benchConfig`)

### 3d. Update `bench.config.yaml`

- [x] Move the `hello-world-api` task's `prompt` and `acceptance_criteria` inline into `variantDefaults` in the converted YAML config
- [x] Keep `tasks/hello-world-api.md` as reference; it is no longer required at runtime
