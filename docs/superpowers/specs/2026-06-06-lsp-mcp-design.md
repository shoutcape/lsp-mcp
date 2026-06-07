# lsp-mcp Design Spec

Date: 2026-06-06
Status: approved for planning

## Purpose

`lsp-mcp` is a harness-neutral MCP server that exposes IDE-grade semantic code intelligence to agents. It gives agents access to language-server-backed understanding such as diagnostics, definitions, type information, references, symbols, call hierarchy, signature help, and rename previews without duplicating the file search, file read, or file edit tools already provided by most agent harnesses.

The MVP starts with TypeScript and JavaScript through `typescript-language-server`, while preserving an architecture that can add other language servers later.

## Non-Goals

- Do not replace harness-native `read`, `grep`, `glob`, `edit`, `write`, or `apply_patch` tools.
- Do not expose a raw LSP method dump as MCP tools.
- Do not provide code actions in the MVP.
- Do not build a custom symbol index in the MVP.
- Do not auto-install language servers or project dependencies.
- Do not act as a VS Code, Neovim, or editor-facing language server.
- Do not expose MCP resources in the MVP.
- Do not apply refactors in the MVP; rename is preview-only.

## Runtime Architecture

```text
MCP client / agent harness
  -> lsp-mcp stdio server
    -> MCP tool handlers
      -> SemanticProvider interface
        -> LspSemanticProvider
          -> LSP session manager
            -> TypeScript preset
              -> typescript-language-server --stdio
                -> project-local TypeScript / tsserver
```

The public MCP API is agent-friendly and stable. Raw LSP details are contained behind a semantic provider boundary so future implementations can add other LSP servers or a direct TypeScript `tsserver` provider without changing the public tools.

## Core Components

- `cli`: starts the stdio MCP server, loads config, sets logging, and keeps stdout reserved for MCP protocol messages.
- `config`: loads optional `lsp-mcp.config.jsonc`, CLI/env overrides, and MCP Roots.
- `mcp`: registers MCP tools and validates tool inputs.
- `providers`: defines the `SemanticProvider` interface used by tools.
- `lsp`: manages JSON-RPC transport, LSP initialization, requests, notifications, diagnostics, document sync, health, restarts, and idle eviction.
- `languages/typescript`: implements TypeScript preset hooks for extension matching, project detection, dependency validation, and language server command resolution.
- `output`: formats results as compact structured text.
- `safety`: enforces root confinement, path normalization, symlink escape rejection, file-size limits, and result limits.

## Tool Surface

MCP tool names are unprefixed. Harnesses that prefix tools by MCP server name can expose them as names such as `lsp_health` while the internal MCP tool remains `health`.

### Phase 1: Foundation

- `health`
- `capabilities`
- `diagnostics`
- `hover`
- `definition`

### Phase 2: Navigation

- `type_definition`
- `references`
- `workspace_symbols`
- `document_symbols`
- `implementation`
- `signature_help`
- `call_hierarchy`

### Phase 3: Refactoring Preview

- `rename_preview`

`rename_apply` is intentionally excluded from the MVP and may be added later as a separate explicit tool.

## Tool Input Model

Public coordinates use one-based `line` and `column` values. The server converts them to LSP zero-based positions internally.

Position-based input is canonical:

```text
file: src/App.tsx
line: 12
column: 18
```

Symbol convenience input is also supported for file-based tools:

```text
file: src/App.tsx
symbol: Button
```

If a symbol input resolves to exactly one candidate in the file, the server uses that candidate position. If it resolves to multiple candidates, the server returns an ambiguity response with candidate locations. If no candidate is found, the server returns a not-found response.

Workspace tools follow natural inputs:

- `workspace_symbols` requires a non-empty `query`.
- `diagnostics` supports `scope: file | project | workspace`.
- `call_hierarchy` supports `direction: incoming | outgoing | both` and `depth`.

Common options:

- `limit`, defaulting to 50.
- `snippetLines`, defaulting to no snippets.
- Tool-specific filters such as diagnostic severity, symbol kind, source, code, and file pattern.
- `includeDiff` for `rename_preview` only.

## Output Model

MVP tools return structured plain text, not JSON-first payloads. Output should be compact, stable, line-oriented, and readable by both humans and agents.

Example definition output:

```text
Status: ready
Tool: definition
Query: src/App.tsx:12:18 Button
Result: 1 definition

1. src/components/Button.tsx:7:17-7:23
```

Example unavailable output:

```text
Status: unavailable
Tool: references
Reason: language server does not support textDocument/references.
Suggested fallback: use harness grep for textual search, or check capabilities with check=true.
```

Example truncation output:

```text
Result: 50 references
Limit: 50
Truncated: true
Suggestion: narrow with filePattern or increase limit.
```

JSON output and raw LSP payloads are out of scope for the MVP. JSON may be added later if a real consumer needs it.

## Workspace Resolution

Workspace roots are resolved in this order:

```text
1. MCP Roots from the client
2. CLI/env projectRoot override
3. lsp-mcp.config.jsonc roots/projectRoot
4. setup error if no root is available
```

The server must not guess from process cwd if no workspace root is available.

## Path Safety

Every requested file path must resolve inside an allowed workspace root. The server rejects:

- `..` path escapes.
- Absolute paths outside configured roots.
- Symlinks that resolve outside configured roots.

The server only reads files needed for LSP document sync and optional snippets. It is not a general-purpose file reader.

## TypeScript Project Routing

For a file request, the TypeScript preset routes to a project anchor as follows:

```text
file request
  -> owning workspace root
  -> walk upward from file
  -> nearest tsconfig.json
  -> else nearest package.json
  -> else owning root
```

The detected project anchor becomes the session cache key.

## Session Lifecycle

LSP sessions are lazy and cached by detected project anchor.

```text
request
  -> resolve file/root/project anchor
  -> lookup session by anchor
  -> start TypeScript LSP if missing
  -> validate project-local typescript
  -> initialize LSP
  -> sync requested document from disk
  -> execute semantic request
```

Session behavior:

- One cached LSP session per detected project anchor.
- Default idle timeout around 15 minutes.
- Idle sessions are stopped.
- Crashed sessions are marked `degraded` or `failed`.
- On the next request after a crash, the server attempts one clean restart.
- `health` reports `not_started`, `starting`, `ready`, `degraded`, or `failed`.

## Document Sync

Disk is the source of truth. The MVP does not use a filesystem watcher.

For each file-based request:

1. Read the current file content from disk.
2. Hash the content.
3. If the document is not open in the LSP session, send `didOpen` with version 1.
4. If the content changed since the last sync, send full-document `didChange` with an incremented version.

The MVP uses full-document sync instead of incremental edits.

## Diagnostics

Diagnostics remain code-focused. Setup, dependency, server, and runtime issues belong in `health`.

Diagnostic behavior:

- Prefer LSP pull diagnostics when the server supports them.
- Fall back to push diagnostics from opened and synced files.
- Support `scope: file | project | workspace`.
- Default to file scope when `file` is provided.
- Report completeness as `complete`, `partial`, `stale`, or `unavailable`.

## Health And Capabilities

`health` is passive by default and reports known state. With `check: true`, it actively resolves the project, starts or initializes the LSP session if needed, and reports readiness.

`capabilities` is static by default and reports what the MCP supports. With `check: true`, it starts or checks the relevant LSP session and reports live server capabilities.

The server does not claim that a project is indexed. Portable health states are limited to `not_started`, `starting`, `ready`, `degraded`, and `failed`.

## Configuration

The optional config file is `lsp-mcp.config.jsonc`.

Example:

```jsonc
{
  "roots": ["."],
  "languages": {
    "typescript": {
      "preset": "typescript",
      "enabled": true,
      "command": ["typescript-language-server", "--stdio"],
      "extensions": [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"],
      "projectMarkers": ["tsconfig.json", "package.json"]
    }
  },
  "sessions": {
    "idleTimeoutMs": 900000,
    "restartOnCrash": true
  },
  "output": {
    "defaultLimit": 50
  }
}
```

Defaults should make config unnecessary for common TypeScript projects.

## TypeScript Setup Requirements

The MVP must not auto-install dependencies.

- `typescript-language-server` must be available through an explicit configured command or `PATH`.
- The target TypeScript project must have project-local `typescript` installed.
- If `typescript-language-server` is missing, `health` reports a setup error.
- If project-local `typescript` is missing, `health` reports a TypeScript setup error for that project.

## Packaging And Tooling

- Package: `@shoutcape/lsp-mcp`
- Binary: `lsp-mcp`
- Runtime: Node 20+
- Source language: TypeScript
- Module output: ESM
- Package manager: pnpm
- MCP SDK: official MCP TypeScript SDK
- LSP client packages: `vscode-jsonrpc` and `vscode-languageserver-protocol`
- Validation: Zod
- Tests: Vitest
- Lint and format: Biome
- Transport: stdio only

## Logging

- Silent by default.
- stdout is reserved for MCP protocol messages only.
- Logs go to stderr only when enabled.
- `debug` logging includes lifecycle, session, routing, setup, and restart events.
- `trace` logging includes raw LSP JSON-RPC messages and must warn that traces may include source code, symbols, paths, diagnostics, and hover contents.

## Testing And CI

Testing strategy:

- Unit tests with mocked provider and LSP layers for routing, validation, output formatting, safety, and error handling.
- Integration tests against real `typescript-language-server` using fixture TypeScript projects.

CI target:

- Typecheck.
- Biome lint and format checks.
- Unit tests.
- TypeScript LSP integration tests.
- Package build.
- CLI smoke test.
- npm publish dry-run.

## Milestones

### Phase 1: Foundation

Implement server bootstrap, config loading, root resolution, safety checks, TypeScript preset validation, LSP session startup, document sync, diagnostics, hover, definition, health, and capabilities.

### Phase 2: Navigation

Add type definition, references, workspace symbols, document symbols, implementation navigation, signature help, and call hierarchy.

### Phase 3: Refactoring Preview

Add `rename_preview` with default summary output and optional unified diff preview.

## Open Future Work

- Add Python, Rust, Go, and other presets after the TypeScript MVP is stable.
- Add JSON output only if a real consumer needs it.
- Add MCP resources after tool behavior is proven.
- Add `rename_apply` only as an explicit separate tool with clear safety and permission semantics.
- Consider direct `tsserver` provider only if LSP misses important TypeScript-specific workflows.
