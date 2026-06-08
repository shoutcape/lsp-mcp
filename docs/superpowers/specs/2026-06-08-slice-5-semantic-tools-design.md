# Slice 5 Semantic Tools Design

Date: 2026-06-08
Status: approved for planning

## Purpose

Slice 5 adds the first real semantic MCP tools on top of the initialized TypeScript LSP session from Slice 4. It proves that `lsp-mcp` can sync requested files from disk, execute position-based LSP requests, capture TypeScript diagnostics, and return compact plain-text results through stable MCP tools.

This slice makes the server useful for agent workflows that need definition lookup, reference lookup, hover type information, and targeted diagnostics without replacing harness-native read, grep, glob, edit, or patch tools.

## Scope

Build:

- Public MCP tools: `goto_definition`, `find_references`, `hover`, and `diagnostics`.
- Provider contract methods for definition, references, hover, and diagnostics.
- Full-document disk sync for requested files using `textDocument/didOpen` and `textDocument/didChange`.
- Content hashing so unchanged files are not resent to the language server.
- LSP request helpers for `textDocument/definition`, `textDocument/references`, and `textDocument/hover`.
- Push diagnostics capture through `textDocument/publishDiagnostics`.
- Diagnostics waiting with bounded timeout for requested files.
- Session accessors for active LSP connection, document sync, and diagnostics store.
- Plain-text result formatting for all new tools.
- Real TypeScript integration fixture coverage for definition, references, hover, and diagnostics.
- README and slice docs updates after implementation.

Do not build:

- Symbol-name convenience input or in-file symbol disambiguation.
- Relative path conversion beyond existing workspace safety and routing behavior.
- Pull diagnostics through `textDocument/diagnostic`.
- Project-wide or workspace-wide diagnostics sweeps.
- Snippets or source excerpts in semantic tool output.
- Result limiting, file pattern filtering, or severity filtering.
- Type definition, implementation, workspace symbols, document symbols, signature help, call hierarchy, or rename preview.
- Raw LSP method exposure as MCP tools.
- Code actions or edits.
- File watchers.
- Idle eviction or restart-on-crash behavior.

## Architecture

Slice 5 extends the Slice 4 runtime path:

```text
MCP client
  -> lsp-mcp server
    -> semantic tool handler
      -> SemanticProvider
        -> LspSemanticProvider
          -> LspSessionManager.ensureSession(file)
            -> LspSession
              -> DocumentSync.prepareFile(file, languageId)
              -> LSP request or diagnostics wait
```

The MCP layer owns tool registration, input schema validation, and plain-text formatting. It does not know raw LSP payload details beyond provider result shapes.

The provider layer owns user-facing semantic behavior. It ensures the session is ready, syncs the requested file, calls semantic request helpers, converts LSP zero-based locations to one-based public coordinates, and maps diagnostics to compact entries.

The LSP layer owns JSON-RPC connection access, document sync state, diagnostics notification storage, and session cleanup.

## Tool Surface

Public tool names for this slice are:

```text
health
capabilities
find_references
hover
```

`goto_definition` and `find_references` intentionally use action-oriented names instead of raw LSP method names. The tools still call `textDocument/definition` and `textDocument/references` internally.

## Provider Contract

The `SemanticProvider` interface expands with file-position tools and diagnostics:

```ts
export interface FileLocation {
  file: string;
  line: number;
  column: number;
}

export interface DefinitionEntry {
  file: string;
  line: number;
  column: number;
}

export interface DefinitionResult {
  definitions: DefinitionEntry[];
}

export interface ReferenceEntry {
  file: string;
  line: number;
  column: number;
  isDefinition: boolean;
  isWriteAccess: boolean;
}

export interface ReferencesResult {
  references: ReferenceEntry[];
}

export interface HoverResult {
  content: string;
}

export interface DiagnosticEntry {
  file: string;
  line: number;
  column: number;
  severity: "error" | "warning" | "information" | "hint";
  message: string;
  code?: number | string;
}

export interface DiagnosticsRequest {
  file?: string;
  files?: string[];
}

export interface DiagnosticsResult {
  diagnostics: DiagnosticEntry[];
}
```

Position inputs are one-based. The provider converts to LSP zero-based positions immediately before sending requests.

## Tool Inputs

Position tools use the same input shape:

```ts
{
  file: string;
  line: number;
  column: number;
}
```

`file` is currently an absolute path in the MCP schema. Earlier design docs describe user-facing relative paths; relative path support can be added later if consumers need it, but Slice 5 should not add a second path interpretation mode.

Diagnostics input:

```ts
{
  file?: string;
  files?: string[];
}
```

If neither `file` nor `files` is provided, diagnostics returns an empty result rather than starting a language server.

## Tool Output

Definition success:

```text
Definition(s) for symbol at /workspace/src/index.ts:3:16:

  /workspace/src/utils.ts:2:17
```

Definition miss:

```text
No definition found at /workspace/src/index.ts:3:16
```

References success:

```text
References (2 total):

  /workspace/src/utils.ts:
    L2:17 [read]
  /workspace/src/index.ts:
    L3:16 [read]
```

Hover success:

```text
Type info at /workspace/src/index.ts:3:7:

  const result: number
```

Diagnostics success:

```text
Diagnostics: 1 total (1 errors, 0 warnings)

  /workspace/src/broken.ts:
    L1:7 [ERROR TS2322] Type 'string' is not assignable to type 'number'.
```

No raw JSON or raw LSP payloads should be printed.

## Document Sync

Disk remains the source of truth. For each file-based request:

```text
requested file
  -> ensure TypeScript LSP session is ready
  -> read current file content from disk
  -> compute sha256 hash
  -> if unseen, send textDocument/didOpen with version 1
  -> if hash changed, send textDocument/didChange with full content and incremented version
  -> if hash unchanged, send no sync notification
  -> execute semantic request or wait for diagnostics
```

The MVP uses full-document sync only. It does not track incremental edits or watch files.

## LSP Requests

Slice 5 sends these LSP requests:

```text
textDocument/definition
textDocument/references
textDocument/hover
```

Definition results may be `Location`, `Location[]`, `LocationLink[]`, or null. The provider should normalize both location and location-link shapes to file, line, and column.

References use `includeDeclaration: true` by default. TypeScript does not always provide write-access metadata through this path, so Slice 5 may return conservative flags.

Hover supports string, markup content, and array content shapes. The provider should flatten content into compact text.

## Diagnostics

Slice 5 uses push diagnostics from `textDocument/publishDiagnostics`.

Behavior:

- `LspSession` registers a diagnostics notification handler after initialization succeeds.
- `DiagnosticsStore` stores latest diagnostics by URI.
- `DiagnosticsStore.waitForDiagnostics(uri, timeoutMs)` resolves when diagnostics arrive or returns an empty array after timeout.
- `diagnostics` clears stale store state before preparing each requested file.
- Each diagnostic maps LSP severity to `error`, `warning`, `information`, or `hint`.

This is intentionally targeted and file-based. Project and workspace diagnostic completeness are future work.

## Setup And Failure Behavior

Semantic tools require a ready LSP session. If session startup or routing fails, provider methods should fail through normal MCP tool error behavior or return empty diagnostics where appropriate. `health` remains the primary setup diagnostic surface.

Missing `typescript-language-server`, missing project TypeScript, unsupported file types, and workspace root problems should not crash the MCP server and must not write logs to stdout.

## Testing

Unit tests should cover:

- `DocumentSync` sends `didOpen` on first access.
- `DocumentSync` sends full `didChange` when content changes.
- `DocumentSync` skips notification when content is unchanged.
- `DiagnosticsStore` stores diagnostics by URI.
- `DiagnosticsStore.waitForDiagnostics` resolves on notification.
- `DiagnosticsStore.waitForDiagnostics` returns empty on timeout.
- Request helpers send correct LSP methods and params.
- `LspSession` exposes connection, diagnostics store, and document sync after readiness.
- `LspSemanticProvider` reports new supported tools in capabilities.
- Tool formatters handle empty and non-empty results.
- MCP server registers all six tools.
- Existing Slice 1 through Slice 4 tests continue to pass.

Integration tests should use a real fixture TypeScript project and local `typescript-language-server` dev dependency to cover:

- Definition from an imported usage resolves to exported source symbol.
- References include definition and usage.
- Hover returns inferred type text.
- Diagnostics arrive for a broken TypeScript file.

Acceptance commands:

```sh
pnpm test
pnpm check
pnpm build
timeout 1s node dist/cli.js
```

The bounded CLI smoke should still produce no stdout logs outside MCP protocol output.

## Risks

- Push diagnostics are timing-sensitive. Keep a bounded wait and avoid unbounded hangs.
- Clearing diagnostics before each request avoids stale results but can hide earlier diagnostics if the server is slow. Pull diagnostics can improve this later.
- Absolute path input is easy for tests but less ergonomic for agents. Add relative paths only when path semantics are settled.
- Reference metadata is conservative because plain LSP references do not reliably include definition/write flags for every server.
- Tool descriptions can overpromise compared with LSP behavior. Keep descriptions useful but avoid claiming complete indexing or perfect alias resolution.

## Self-Review

- Placeholder scan: no placeholders remain.
- Scope check: focused on first semantic tools, document sync, and push diagnostics.
- Ambiguity check: public tool names are `goto_definition` and `find_references`.
- Consistency check: MCP outputs remain compact plain text, and raw LSP payloads remain internal.
