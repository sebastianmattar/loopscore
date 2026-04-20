# Plan: Workspace Setup Features (v1.8)

## TL;DR

Extend `SetupConfig` with three new fields — `files`, `promptFile`, and `copilotInstructionsMd` — so users can fully configure benchmarking workspaces from `bench.config.json` without touching task files or agent adapters.

## Steps

### Phase 1 — Types & schema

1. **`src/types.ts`** — Add to `SetupConfig`:
   - `files?: Record<string, string>` — map of `{ "dest/path": "contents" }`
   - remove existing skillsDir, agentsMd, mcpJson
2. **`src/config.ts`** — Add the same three fields to `SetupConfigSchema`:
   - `files`: `z.record(z.string(), z.string()).optional()`

### Phase 2 — Config path resolution

3. **`src/config.ts`** — In `loadConfig`, resolve all `SetupConfig` path fields (existing: `skillsDir`, `agentsMd`, `mcpJson`; new: `promptFile`, `copilotInstructionsMd`, `files` values) relative to `configDir`, so relative paths in `bench.config.json` always work regardless of cwd.

### Phase 3 — Workspace execution

4. **`src/runner/workspace.ts`** — Extend `copySetupFiles()`:
   - `copilotInstructionsMd` → copy to `.github/copilot-instructions.md`
   - `promptFile` → read and append content to `requirements.md` after it is written
   - `files` → iterate entries, `mkdirSync` parent dirs, copy each src to dest

## Relevant Files

| File                      | Change                                                    |
| ------------------------- | --------------------------------------------------------- |
| `src/types.ts`            | Add fields to `SetupConfig`                               |
| `src/config.ts`           | Extend `SetupConfigSchema`; resolve paths in `loadConfig` |
| `src/runner/workspace.ts` | Handle new fields in `copySetupFiles`                     |

## Decisions

- `promptFile` **appends** to `requirements.md` — keeps task content intact, lets you layer agent-specific instructions per variant
- `copilotInstructionsMd` is separate from `agentsMd` (which writes `.github/agents.md`) since they target different agents and paths
- `files` src paths are resolved relative to configDir; dest paths are relative to workspace root
- All new fields inherit through `variantDefaults` → variant merge automatically (handled by existing spread merge in `resolveVariantAgentConfig`)
- Out of scope: template variable substitution inside copied files

## Verification

1. Add `setup.files`, `setup.promptFile`, `setup.copilotInstructionsMd` to `bench.config.json`, run `pnpm run dev run-all -f`, inspect the workspace temp dir
2. `pnpm run build` — no TypeScript errors
