# Slice 6 Zero-Config Workspace Inference Design

Date: 2026-06-09
Status: implemented

## Purpose

Slice 6 removes the requirement to configure explicit workspace roots before using `lsp-mcp`. When no roots are configured, the server infers the TypeScript project root by walking up the directory tree from the requested file and looking for standard project markers (`tsconfig.json`, `package.json`). This makes `lsp-mcp` usable in a zero-config setup where an agent points it at any TypeScript file without pre-configuring a workspace.

Previously, a missing `roots` config caused the server to fail at startup or when the first semantic request arrived. Slice 6 makes `roots` optional everywhere and introduces a safe inference path for the no-roots case.

## Scope

Build:

- Zero-config workspace inference: when `roots` is empty, resolve the TypeScript project root by walking up from the file's directory and checking for project markers.
- `findProjectRoot` walks up to the filesystem root and falls back to the file's own directory when no marker is found.
- `resolveWorkspaceRoots` made infallible: always returns `{ ok: true }` with an empty roots array when no roots are configured, removing the previous error path.
- Remove startup failure for missing workspace roots from `server.ts` and dependent call sites.
- Preserve diagnostics for unchanged files: fix a regression where `DiagnosticsStore` cleared diagnostics when a file's content hash had not changed (because the diagnostics wait was scoped to the `didOpen`/`didChange` revision bump).
- `waitForDiagnosticsAfter` added to `DiagnosticsStore` to support revision-aware waiting without clearing the store.
- README zero-config usage section and Quick Start update.

Do not build:

- MCP Roots negotiation or client-advertised workspace roots.
- Symlink escape detection.
- Support for non-TypeScript languages in the zero-config path.
- Relative path handling beyond what the existing routing and safety code already supports.
- Automatic re-initialization when a new workspace root is discovered at request time.
- Any new public MCP tool surface (no new tools in this slice).

## Architecture

### Existing path (roots configured)

```text
request with file path
  -> routeTypeScriptProject(requestedPath, roots, preset)
    -> resolveSafePath (confines path inside one of the configured roots)
    -> findProjectAnchor (finds nearest tsconfig.json walking up to root boundary)
    -> return { ok: true, path, root, projectAnchor, languageId }
```

### New zero-config path (roots empty)

```text
request with file path
  -> routeTypeScriptProject(requestedPath, roots=[], preset)
    -> resolve absolute file path
    -> check languageId via preset.languageIdForPath
    -> findProjectRoot(dirname(filePath), preset.getProjectMarkers())
      -> walk up directory tree checking for marker files
      -> fallback to file's own directory if no marker found
    -> return { ok: true, path, root: { path: inferredRoot }, projectAnchor: inferredRoot, languageId }
```

Path safety is intentionally skipped when roots are empty. The server trusts that an agent calling a tool with an absolute path already has access to that file. Configuring explicit roots re-enables the path safety confinement from Slice 3.

### Diagnostics revision fix

Before Slice 6, `diagnostics` called `DiagnosticsStore.waitForDiagnostics` after `DocumentSync.prepareFile`. When the file content was unchanged, `prepareFile` sent no LSP notification, so no new `publishDiagnostics` arrived. `waitForDiagnostics` checked whether the URI was already in the store and returned existing diagnostics immediately -- but the store had been cleared by the provider before calling `prepareFile`, so the wait returned an empty array.

Slice 6 fixes this with two changes:

1. `DiagnosticsStore.waitForDiagnosticsAfter(uri, revision)` -- resolves immediately if the current revision is already ahead of the given revision, otherwise waits for the next notification.
2. `LspSemanticProvider.getDiagnostics` records the current revision before preparing the file. After `prepareFile`:
   - If content changed, a new `publishDiagnostics` will arrive, advancing the revision. `waitForDiagnosticsAfter` waits for it.
   - If content was unchanged, no notification arrives. `waitForDiagnosticsAfter` returns existing diagnostics immediately because the revision did not change.

## Behavior Changes

### `resolveWorkspaceRoots`

Before:

```ts
// returned { ok: false, error: { code: "no_workspace_roots" } } when roots was empty
```

After:

```ts
// always returns { ok: true, roots: [] } -- empty array is valid
```

### `routeTypeScriptProject`

Before:

```ts
// returned { ok: false, error: { code: "no_workspace_roots" } } immediately
```

After:

```ts
if (options.roots.length === 0) {
  // infer root from file path -- no path safety enforced
  const inferredRoot = await findProjectRoot(dirname, markers);
  return { ok: true, path, root: { path: inferredRoot }, projectAnchor: inferredRoot, languageId };
}
// existing configured-roots path unchanged
```

### `server.ts`

The explicit startup check that returned an error when workspace roots were empty is removed. The server now starts successfully with no configuration and defers root resolution to the first semantic request.

## Project Marker Lookup Order

`routeTypeScriptProject` delegates to `preset.getProjectMarkers()` for the marker list. The TypeScript preset returns:

```ts
["tsconfig.json", "package.json"]
```

`findProjectRoot` checks markers in order at each directory level. `tsconfig.json` is checked before `package.json`, so a nested package with its own `tsconfig.json` takes precedence over a parent `package.json`.

## Testing

Unit tests added or extended in this slice:

- `tests/languages/typescript/project-routing.test.ts` -- zero-config path: infers root when no roots configured, falls back to file directory when no marker found, still enforces path safety when roots are present, returns error for unsupported file type.
- `tests/lsp/diagnostics-store.test.ts` -- `waitForDiagnosticsAfter` resolves immediately when revision already advanced, waits for next notification when at same revision, times out when no notification arrives.
- `tests/lsp/document-sync.test.ts` -- no sync notification when content hash is unchanged (existing behavior confirmed).
- `tests/providers/lsp-semantic-provider.test.ts` -- diagnostics preserved for unchanged file content (regression test for the revision-tracking fix).
- `tests/workspace/resolve-roots.test.ts` -- `resolveWorkspaceRoots` returns empty roots array for empty input (no error).
- `tests/server.test.ts` -- server starts without configured roots.
- `tests/integration/semantic-tools.test.ts` -- semantic tools operate correctly without explicit roots config.

Acceptance commands:

```sh
pnpm test
pnpm check
pnpm build
timeout 1s node dist/cli.js
```

The bounded CLI smoke test must produce no stdout output outside MCP protocol framing.

## Risks

- **No path safety in zero-config mode.** When roots are empty, any absolute path is accepted. This is a deliberate trust decision: the agent controls which paths it passes. Users who need confinement should configure explicit roots.
- **Marker fallback to file directory.** If `findProjectRoot` reaches the filesystem root without finding a marker, it returns the file's own directory. This means the language server may start with a minimal root that lacks a `tsconfig.json`, which can reduce TypeScript analysis quality.
- **Single-root inference.** Each file's root is inferred independently. Two files in the same project but in different directories may each trigger their own root inference. Session reuse mitigates the cost, but root consistency is not guaranteed across files.
- **Diagnostics timing.** The revision-tracking approach still relies on bounded waits. If a language server is slow to publish diagnostics after a `didChange`, the wait may time out and return stale or empty results.

## Self-Review

- Placeholder scan: no placeholders remain.
- Scope check: no new MCP tools, only routing and diagnostics correctness changes.
- Ambiguity check: zero-config path is clearly separated from the configured-roots path in `routeTypeScriptProject`.
- Consistency check: `resolveWorkspaceRoots` return type is now always `{ ok: true; roots: WorkspaceRoot[] }` -- the error union member is removed, callers updated accordingly.
