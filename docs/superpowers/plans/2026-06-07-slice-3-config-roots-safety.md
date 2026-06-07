# Slice 3 Config Roots Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional JSONC config loading, explicit workspace root resolution, and pure path safety before real LSP behavior.

**Architecture:** Config loading validates partial user config and merges it into existing defaults. Root resolution converts configured roots into normalized absolute workspace roots without cwd fallback. Path safety resolves future file requests inside those roots and rejects escapes without reading the filesystem.

**Tech Stack:** Node 20, TypeScript ESM, pnpm, Zod v4, `jsonc-parser@3.3.1`, Vitest, Biome.

---

## File Structure

- Modify `package.json`: add pinned runtime dependency `jsonc-parser@3.3.1`.
- Modify `pnpm-lock.yaml`: lock `jsonc-parser`.
- Modify `src/config/config.ts`: add partial config input types and deep default merge helper.
- Create `src/config/schema.ts`: strict Zod schema for partial config input.
- Create `src/config/load-config.ts`: optional JSONC config loader with typed success/error results.
- Create `src/workspace/resolve-roots.ts`: resolve configured roots into absolute `WorkspaceRoot[]` or typed setup error.
- Create `src/safety/path-safety.ts`: pure helper to resolve requested paths inside allowed roots.
- Create `tests/config/load-config.test.ts`: config loader behavior and errors.
- Create `tests/workspace/resolve-roots.test.ts`: root resolution behavior and no-root error.
- Create `tests/safety/path-safety.test.ts`: safe path resolution and escape rejection.
- Modify `README.md`: update status and include Slice 3 spec link.

## Task 1: Config Dependency And Loader

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `src/config/config.ts`
- Create: `src/config/schema.ts`
- Create: `src/config/load-config.ts`
- Test: `tests/config/load-config.test.ts`

- [ ] **Step 1: Write failing config loader tests**

Cover missing config defaults, JSONC comments, trailing commas, partial merge, parse error, validation error, unknown top-level fields, unknown nested fields, explicit missing config path, directory-as-config read error, explicit `baseDir`, omitted `baseDir` cwd lookup, relative `configPath`, and `configPath` returning the config file directory as the success `baseDir`.

- [ ] **Step 2: Verify tests fail before implementation**

Run: `pnpm test tests/config/load-config.test.ts`

Expected: FAIL because `src/config/load-config.ts` does not exist.

- [ ] **Step 3: Add dependency**

Run: `pnpm add jsonc-parser@3.3.1 --save-exact`

Expected: `package.json` and `pnpm-lock.yaml` updated with pinned runtime dependency.

- [ ] **Step 4: Add config input and merge helper**

Add `DeepPartial`, `LspMcpConfigInput`, and `mergeConfigWithDefaults(input)` to `src/config/config.ts`.

- [ ] **Step 5: Add strict schema**

Create `src/config/schema.ts` with strict Zod objects matching the partial config shape.

- [ ] **Step 6: Add loader**

Create `src/config/load-config.ts` using `fs/promises`, `path`, `jsonc-parser`, schema validation, and typed result objects.

The public loader API should include:

```ts
export interface LoadConfigOptions {
  configPath?: string;
  baseDir?: string;
}

export type LoadConfigResult =
  | { ok: true; config: LspMcpConfig; baseDir: string; configPath?: string }
  | { ok: false; error: LoadConfigError };
```

For success results, `baseDir` is absolute. It is the config file directory when `configPath` is used, otherwise the explicit or cwd lookup directory. This lets root resolution use the same directory for relative roots without root resolution using cwd implicitly.

For normal setup failures, return `config_not_found`, `config_parse_error`, `config_validation_error`, or `config_read_error`.

- [ ] **Step 7: Verify config tests pass**

Run: `pnpm test tests/config/load-config.test.ts`

Expected: PASS.

## Task 2: Root Resolution

**Files:**
- Create: `src/workspace/resolve-roots.ts`
- Test: `tests/workspace/resolve-roots.test.ts`

- [ ] **Step 1: Write failing root resolver tests**

Cover empty roots error, relative roots against base dir, absolute roots, and syntactic normalization.

- [ ] **Step 2: Verify tests fail before implementation**

Run: `pnpm test tests/workspace/resolve-roots.test.ts`

Expected: FAIL because `src/workspace/resolve-roots.ts` does not exist.

- [ ] **Step 3: Implement root resolver**

Create `resolveWorkspaceRoots({ roots, baseDir })` returning typed success/error results. Do not read the filesystem. Do not use cwd as fallback.

- [ ] **Step 4: Verify workspace tests pass**

Run: `pnpm test tests/workspace/resolve-roots.test.ts`

Expected: PASS.

## Task 3: Path Safety

**Files:**
- Create: `src/safety/path-safety.ts`
- Test: `tests/safety/path-safety.test.ts`

- [ ] **Step 1: Write failing path safety tests**

Cover empty path, empty roots, relative inside-root path, absolute inside-root path, `..` escape, sibling-prefix escape, and absolute outside-root path.

- [ ] **Step 2: Verify tests fail before implementation**

Run: `pnpm test tests/safety/path-safety.test.ts`

Expected: FAIL because `src/safety/path-safety.ts` does not exist.

- [ ] **Step 3: Implement safe path resolver**

Create `resolveSafePath({ requestedPath, roots })` returning typed success/error results. Use Node path normalization only. Do not read files or resolve symlinks.

- [ ] **Step 4: Verify safety tests pass**

Run: `pnpm test tests/safety/path-safety.test.ts`

Expected: PASS.

## Task 4: README And Full Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README status**

Mention Slice 3 config, roots, and safety foundation. State that real LSP behavior remains future work.

- [ ] **Step 2: Run all tests**

Run: `pnpm test`

Expected: all tests pass.

- [ ] **Step 3: Run checks**

Run: `pnpm check`

Expected: no Biome errors.

- [ ] **Step 4: Run build**

Run: `pnpm build`

Expected: TypeScript build exits 0.

- [ ] **Step 5: Run bounded CLI smoke**

Run: `timeout 1s node dist/cli.js`

Expected: exits via timeout and prints no stdout logs.

## Task 5: Review Changes

**Files:**
- All implementation files from Tasks 1 through 4.

- [ ] **Step 1: Inspect status, diff, and recent log**

Run: `git status --short`

Run: `git diff`

Run: `git log --oneline -10`

- [ ] **Step 2: Stage only if committing is explicitly requested**

Run: `git add -- package.json pnpm-lock.yaml README.md src/config/config.ts src/config/schema.ts src/config/load-config.ts src/workspace/resolve-roots.ts src/safety/path-safety.ts tests/config/load-config.test.ts tests/workspace/resolve-roots.test.ts tests/safety/path-safety.test.ts`

Run: `git commit -m "feat: add config roots safety foundation"`

Expected: only run these commands when the user explicitly asks for a commit. Otherwise leave reviewed changes unstaged.

## Acceptance Checklist

- [ ] Missing optional config returns defaults.
- [ ] JSONC comments and trailing commas parse.
- [ ] Partial config keeps nested defaults.
- [ ] Invalid config returns typed config errors.
- [ ] Empty roots return typed setup error.
- [ ] Relative roots resolve against explicit base directory.
- [ ] Path safety rejects escapes and outside-root absolute paths.
- [ ] Existing MCP tool behavior remains unchanged.
- [ ] Full verification commands pass with fresh evidence.
