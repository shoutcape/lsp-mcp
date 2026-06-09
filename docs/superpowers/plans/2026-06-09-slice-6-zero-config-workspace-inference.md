# Slice 6 Zero-Config Workspace Inference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the mandatory workspace roots requirement. When no roots are configured, infer the TypeScript project root by walking up from the requested file's directory. Fix a related regression where diagnostics were lost for files whose content had not changed.

**Architecture:** `resolveWorkspaceRoots` becomes infallible (always returns `ok: true`). `routeTypeScriptProject` gains a zero-config branch that calls `findProjectRoot` instead of `resolveSafePath`. `DiagnosticsStore` gains `waitForDiagnosticsAfter` so the provider can wait for new diagnostics only when the file content actually changed. The server startup no longer fails when roots are empty.

**Tech Stack:** Node 20, TypeScript ESM, pnpm, official MCP TypeScript SDK, Zod v4, `vscode-jsonrpc@8.2.1`, `vscode-languageserver-protocol@3.17.5`, `typescript-language-server`, Vitest, Biome.

---

## File Structure

- Modify `src/workspace/resolve-roots.ts`: remove the error union from the return type; always return `{ ok: true, roots }`.
- Modify `src/languages/typescript/project-routing.ts`: add zero-config branch with `findProjectRoot` walk; add `findProjectAnchor` for the existing configured-roots path.
- Modify `src/lsp/diagnostics-store.ts`: add `waitForDiagnosticsAfter(uri, revision, timeoutMs)` and `getRevision(uri)`.
- Modify `src/lsp/document-sync.ts`: return a flag indicating whether content was synced (so callers know whether to expect new diagnostics).
- Modify `src/lsp/session.ts`: expose `diagnosticsStore` accessor; clean up diagnostics state on session stop.
- Modify `src/lsp/session-manager.ts`: update session-like interface to expose diagnostics revision helpers.
- Modify `src/providers/lsp-semantic-provider.ts`: use `waitForDiagnosticsAfter` to preserve diagnostics for unchanged files.
- Modify `src/server.ts`: remove the startup roots check; handle the now-infallible `resolveWorkspaceRoots` result.
- Modify `tests/workspace/resolve-roots.test.ts`: assert empty input returns `{ ok: true, roots: [] }`.
- Modify `tests/languages/typescript/project-routing.test.ts`: add zero-config and fallback cases.
- Modify `tests/lsp/diagnostics-store.test.ts`: add `waitForDiagnosticsAfter` tests.
- Modify `tests/lsp/document-sync.test.ts`: confirm no notification on unchanged content.
- Modify `tests/providers/lsp-semantic-provider.test.ts`: regression test for unchanged-file diagnostics.
- Modify `tests/server.test.ts`: assert server starts with no roots configured.
- Modify `tests/integration/semantic-tools.test.ts`: run semantic tools without explicit roots.
- Modify `README.md`: add Zero-Config usage section and update Quick Start.
- Modify `docs/superpowers/README.md`: add Slice 6 to the slice index.

---

## Task 1: Make `resolveWorkspaceRoots` Infallible

**Files:**
- Modify: `src/workspace/resolve-roots.ts`
- Modify: callers in `src/server.ts`
- Test: `tests/workspace/resolve-roots.test.ts`

- [ ] **Step 1: Remove error union**

Change `resolveWorkspaceRoots` return type from `{ ok: true; roots } | { ok: false; error }` to `{ ok: true; roots: WorkspaceRoot[] }`. When `options.roots` is empty, return `{ ok: true, roots: [] }`.

- [ ] **Step 2: Update `server.ts`**

Remove the branch that checked `resolveWorkspaceRoots` for `ok: false` and returned an error. The function is now always `ok: true`, so the branch is dead code.

- [ ] **Step 3: Update workspace tests**

Add a test case asserting that empty `roots` input returns `{ ok: true, roots: [] }`. Remove or update any test asserting the old `no_workspace_roots` error.

- [ ] **Step 4: Run focused tests**

```sh
pnpm test tests/workspace/resolve-roots.test.ts tests/server.test.ts
```

---

## Task 2: Zero-Config Routing in `routeTypeScriptProject`

**Files:**
- Modify: `src/languages/typescript/project-routing.ts`
- Test: `tests/languages/typescript/project-routing.test.ts`

- [ ] **Step 1: Add zero-config branch**

At the top of `routeTypeScriptProject`, check `options.roots.length === 0`. If empty:

1. Resolve the absolute file path with `path.resolve`.
2. Look up `languageId` via `preset.languageIdForPath`. Return `unsupported_file_type` if undefined.
3. Call `findProjectRoot(path.dirname(filePath), preset.getProjectMarkers())`.
4. Return `{ ok: true, path: filePath, root: { path: inferredRoot }, projectAnchor: inferredRoot, languageId }`.

- [ ] **Step 2: Add `findProjectRoot`**

```ts
async function findProjectRoot(startDirectory: string, markers: string[]): Promise<string> {
  let directory = startDirectory;
  while (true) {
    for (const marker of markers) {
      if (await isFile(path.join(directory, marker))) return directory;
    }
    const parent = path.dirname(directory);
    if (parent === directory) break; // filesystem root
    directory = parent;
  }
  return startDirectory; // fallback: file's own directory
}
```

- [ ] **Step 3: Extract `findProjectAnchor`**

Move the existing anchor-finding logic (walking from file directory up to the root boundary) into a dedicated `findProjectAnchor` function used by the configured-roots path.

- [ ] **Step 4: Write routing tests**

Add cases:
- No roots + file under a directory with `tsconfig.json` -> root is that directory.
- No roots + no marker found -> root is file's own directory.
- No roots + unsupported extension -> `unsupported_file_type` error.
- Roots present -> existing path safety behavior unchanged.

- [ ] **Step 5: Run focused tests**

```sh
pnpm test tests/languages/typescript/project-routing.test.ts
```

---

## Task 3: Diagnostics Revision Tracking

**Files:**
- Modify: `src/lsp/diagnostics-store.ts`
- Modify: `src/lsp/document-sync.ts`
- Modify: `src/lsp/session-manager.ts`
- Modify: `src/providers/lsp-semantic-provider.ts`
- Test: `tests/lsp/diagnostics-store.test.ts`
- Test: `tests/providers/lsp-semantic-provider.test.ts`

- [ ] **Step 1: Add revision tracking to `DiagnosticsStore`**

Add a `revisions` map (`Map<string, number>`). Increment the revision for a URI on every `onDiagnostics` call.

Add:
- `getRevision(uri: string): number` -- returns current revision (0 if never received).
- `waitForDiagnosticsAfter(uri, revision, timeoutMs)` -- resolves immediately if `getRevision(uri) > revision`, otherwise waits for the next `onDiagnostics` for that URI, or times out.

- [ ] **Step 2: Update `LspSemanticProvider.getDiagnostics`**

Before calling `prepareFile`:
1. Record the current revision: `const revisionBefore = store.getRevision(uri)`.

After `prepareFile`:
2. Call `waitForDiagnosticsAfter(uri, revisionBefore)` instead of `waitForDiagnostics`.

If content was unchanged, the revision did not advance, so `waitForDiagnosticsAfter` returns existing store contents immediately.
If content changed, a new `publishDiagnostics` arrives, advancing the revision, and the wait resolves with fresh data.

- [ ] **Step 3: Update diagnostics-store tests**

Add cases:
- `waitForDiagnosticsAfter` returns immediately when revision is already ahead.
- `waitForDiagnosticsAfter` waits when revision matches.
- `waitForDiagnosticsAfter` times out when no notification arrives.

- [ ] **Step 4: Write provider regression test**

Mock `prepareFile` to return "content unchanged" and verify that the provider returns the pre-existing diagnostics from the store rather than an empty array.

- [ ] **Step 5: Run focused tests**

```sh
pnpm test tests/lsp/diagnostics-store.test.ts tests/providers/lsp-semantic-provider.test.ts
```

---

## Task 4: Server Startup Without Roots

**Files:**
- Modify: `src/server.ts`
- Test: `tests/server.test.ts`

- [ ] **Step 1: Remove startup roots guard**

Remove the early-return error that fired when `resolvedRoots.roots` was empty. The server should initialize normally and let the first semantic request trigger zero-config routing.

- [ ] **Step 2: Add server test**

Assert that the MCP server starts successfully and registers all tools when no roots are configured.

- [ ] **Step 3: Run focused tests**

```sh
pnpm test tests/server.test.ts
```

---

## Task 5: Integration And Documentation

**Files:**
- Modify: `tests/integration/semantic-tools.test.ts`
- Modify: `README.md`
- Modify: `docs/superpowers/README.md`

- [ ] **Step 1: Integration test without roots**

Add or update an integration test case that runs `goto_definition`, `hover`, or `diagnostics` against the fixture project without providing `roots` in the config.

- [ ] **Step 2: README zero-config section**

Add a Zero-Config Usage section describing that `roots` is optional and showing a minimal invocation that relies on inference.

Update the Quick Start example if it previously required a config file.

- [ ] **Step 3: Update slice index**

Add Slice 6 row to the table in `docs/superpowers/README.md`.

- [ ] **Step 4: Run full test suite**

```sh
pnpm test
pnpm check
pnpm build
timeout 1s node dist/cli.js
```

All tests must pass and the CLI smoke must produce no stdout output outside MCP protocol framing.
