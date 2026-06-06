# lsp-mcp Architecture

`lsp-mcp` exposes language-server semantics as MCP tools for coding agents. It is not a general file search tool, not a file editor, and not an editor-facing language server.

The MVP is TypeScript/JavaScript first through `typescript-language-server`, with a generic provider shape that can support more languages later.

## Runtime Flow

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

## Boundaries

### MCP Layer

The MCP layer owns tool registration, input validation, and conversion from MCP requests to semantic provider calls. Tool names are agent-friendly, such as `definition`, `diagnostics`, and `rename_preview`.

The MCP layer must not expose raw LSP methods as the public API.

### Semantic Provider Layer

The `SemanticProvider` interface is the stable internal boundary used by tool handlers. It exposes semantic operations such as:

- `getHealth`
- `getCapabilities`
- `getDiagnostics`
- `getDefinition`
- `getTypeDefinition`
- `getReferences`
- `getWorkspaceSymbols`
- `getDocumentSymbols`
- `getHover`
- `getCallHierarchy`
- `getImplementation`
- `getSignatureHelp`
- `previewRename`

The MVP implementation is `LspSemanticProvider`. A future direct `tsserver` provider or other non-LSP provider can implement the same interface.

### LSP Layer

The LSP layer owns:

- JSON-RPC transport over stdio.
- LSP initialization.
- Request and notification dispatch.
- Capability tracking.
- Document sync.
- Diagnostics cache.
- Session health.
- Crash handling and restart.
- Idle eviction.

The LSP layer uses `vscode-jsonrpc` and `vscode-languageserver-protocol`.

### Language Preset Layer

Language presets keep language-specific setup out of the generic LSP provider.

The TypeScript preset owns:

- TS/JS extension matching.
- Project detection by `tsconfig.json`, then `package.json`, then root.
- Validation that project-local `typescript` is installed.
- Resolution of `typescript-language-server` from explicit command or `PATH`.
- LSP initialization options when needed.

## Workspace Routing

Workspace roots are resolved in this order:

```text
1. MCP Roots from the client
2. CLI/env projectRoot override
3. lsp-mcp.config.jsonc roots/projectRoot
4. setup error if no root is available
```

For TypeScript file requests, project routing uses:

```text
file request
  -> owning workspace root
  -> nearest tsconfig.json
  -> else nearest package.json
  -> else owning root
```

The resulting anchor is the LSP session cache key.

## Session Lifecycle

Sessions start lazily. A request for a file resolves the workspace root and project anchor, then starts or reuses the LSP session for that anchor.

Session states are:

- `not_started`
- `starting`
- `ready`
- `degraded`
- `failed`

Sessions have an idle timeout, defaulting to about 15 minutes. Crashed sessions are marked unhealthy. On the next request, the server attempts one clean restart.

## Document Sync

Disk is the source of truth. The MVP does not use a file watcher.

On every file-based request, the server reads the file, hashes its contents, and syncs the LSP document state:

- If unopened, send `didOpen` with version 1.
- If changed, send full-document `didChange` with an incremented version.

Incremental document diffs are out of scope for the MVP.

## Output Contract

Tools return structured plain text. JSON is intentionally excluded from the MVP because it is more expensive for agents to consume and parse.

Output rules:

- Use stable headings such as `Status`, `Tool`, `Query`, `Result`, `Count`, `Limit`, and `Truncated`.
- Use one-based line and column numbers publicly.
- Default to no source snippets.
- Include snippets only when requested with `snippetLines`.
- Use result limits and truncation notices for large outputs.
- Suggest harness-native fallbacks when LSP capabilities are unavailable.

## Safety Model

All paths must resolve inside configured workspace roots. The server rejects paths that escape through `..`, absolute paths outside roots, and symlinks resolving outside roots.

The server should not become a general-purpose file reader or editor. It reads files only for document sync and optional snippets. It does not write files in the MVP.

## MVP Tool Phases

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

## Configuration

Config is optional and stored in `lsp-mcp.config.jsonc`.

The TypeScript preset defaults to these extensions:

```text
.ts .tsx .js .jsx .mjs .cjs .mts .cts
```

Config can override roots, language server command, extensions, project markers, session timeout, restart behavior, and default output limit.

## Packaging

- Package: `@shoutcape/lsp-mcp`
- Binary: `lsp-mcp`
- Runtime: Node 20+
- TypeScript compiled to ESM
- pnpm for development
- stdio MCP transport only

## Verification Strategy

The implementation should be verified with both mocked and real LSP tests.

Mocked tests cover validation, routing, formatting, safety, and failure states. Integration tests run `typescript-language-server` against fixture TypeScript projects.

Release-grade CI should run typecheck, Biome checks, unit tests, integration tests, package build, CLI smoke test, and npm publish dry-run.
