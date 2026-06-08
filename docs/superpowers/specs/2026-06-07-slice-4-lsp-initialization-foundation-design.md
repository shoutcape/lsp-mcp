# Slice 4 LSP Initialization Foundation Design

Date: 2026-06-07
Status: approved for planning

## Purpose

Slice 4 starts the real TypeScript language server path without adding semantic tools yet. It proves that `lsp-mcp` can route a file to a TypeScript project anchor, spawn `typescript-language-server`, initialize it over LSP JSON-RPC, store live capabilities, and report the resulting state through the existing provider-backed `health` and `capabilities` tools.

This slice intentionally stops before document sync and before tools such as `diagnostics`, `hover`, or `definition`. The goal is to surface process, setup, JSON-RPC, initialization, and capability risks while keeping the public tool surface small.

## Scope

Build:

- Pinned runtime dependencies for LSP JSON-RPC and protocol types.
- TypeScript language preset for extension matching, command resolution inputs, and project marker configuration.
- TypeScript project routing from a requested file to a project anchor.
- Filesystem-aware routing checks for nearest `tsconfig.json`, nearest `package.json`, and root fallback.
- LSP session state model for `not_started`, `starting`, `ready`, and `failed`.
- LSP session that spawns `typescript-language-server --stdio` from configured command.
- JSON-RPC connection over the child process stdio streams.
- LSP `initialize` request and initialized notification.
- Captured initialize result capabilities for later semantic tools.
- `LspSemanticProvider` that uses the session manager for active checks.
- Optional active `health` and `capabilities` checks through provider options.
- Tests for preset behavior, project routing, session lifecycle, provider mapping, and tool input handling.
- README and slice docs updates after implementation.

Do not build:

- `diagnostics`, `hover`, `definition`, or any new MCP semantic tool.
- Document sync, `didOpen`, `didChange`, file content hashing, or snippets.
- Pull or push diagnostics handling.
- Restart-on-crash behavior beyond recording a failed state.
- Idle eviction timers.
- MCP Roots negotiation.
- CLI flags or env var overrides.
- Automatic installation of `typescript-language-server` or project-local `typescript`.
- Raw LSP method exposure as MCP tools.

## Architecture

Slice 4 changes the static provider path into an optional real LSP provider path:

```text
MCP client
  -> lsp-mcp server
    -> health/capabilities tool handlers
      -> SemanticProvider
        -> LspSemanticProvider
          -> LspSessionManager
            -> TypeScriptPreset
            -> LspSession
              -> child_process.spawn
              -> vscode-jsonrpc connection
              -> initialize request
```

The MCP layer remains small. It validates tool inputs, passes active check requests to the provider, and formats provider results as structured plain text. It does not know raw LSP details.

The provider layer owns high-level health and capability behavior. The new LSP provider asks the session manager to initialize a TypeScript session when an active check includes a file path.

The LSP layer owns process startup, JSON-RPC connection setup, initialize lifecycle, server capability storage, and failure state.

## Dependencies

Add pinned runtime dependencies:

```text
vscode-jsonrpc@8.2.1
vscode-languageserver-protocol@3.17.5
```

The package must keep Node 20, TypeScript ESM, pnpm, Vitest, Biome, Zod, and the official MCP TypeScript SDK.

## Provider Contract

The existing `SemanticProvider` interface expands only enough for active checks:

```ts
export interface HealthRequest {
  check?: boolean;
  file?: string;
}

export interface CapabilitiesRequest {
  check?: boolean;
  file?: string;
}

export interface SemanticProvider {
  getHealth(request?: HealthRequest): Promise<HealthInfo>;
  getCapabilities(request?: CapabilitiesRequest): Promise<CapabilitiesInfo>;
}
```

Passive calls remain cheap and must not start a process. Active calls use `check: true` and require enough routing input to select a workspace root and project anchor. For Slice 4, the active check input should support `file` because routing is file-centered and future semantic tools are file-based.

If `check: true` is provided without a file, the provider returns a setup-style failed health result explaining that a file is required for active TypeScript session routing. It must not guess from cwd.

## Tool Inputs

Current tools gain optional input schemas:

```ts
health({ check?: boolean, file?: string })
capabilities({ check?: boolean, file?: string })
```

Default calls remain passive:

```text
health({})
capabilities({})
```

Active examples:

```text
health({ check: true, file: "src/index.ts" })
capabilities({ check: true, file: "src/index.ts" })
```

Public coordinates remain user-facing paths. `resolveSafePath` confines the file to configured workspace roots before project routing starts.

## Tool Output

Passive health should still be stable and cheap:

```text
Status: not_started
Tool: health
Message: LSP sessions are not started.
```

Active ready health:

```text
Status: ready
Tool: health
Message: TypeScript LSP initialized.
```

Active failed health:

```text
Status: failed
Tool: health
Message: Unable to initialize TypeScript LSP: <reason>
```

Passive capabilities should list MCP tools and report LSP as implemented but not started once the real provider is wired:

```text
Status: not_started
Tool: capabilities
Supported tools: health, capabilities
LSP: implemented
```

Active capabilities should report the active session state and include a concise summary of live server support when initialization succeeds:

```text
Status: ready
Tool: capabilities
Supported tools: health, capabilities
LSP: implemented
Server capabilities: definitionProvider, hoverProvider, textDocumentSync
```

The exact live capability names should be derived from the initialize result and kept compact. Raw JSON must not be printed.

## TypeScript Preset

The TypeScript preset consumes resolved config:

```ts
export interface TypeScriptPreset {
  languageIdForPath(filePath: string): string | undefined;
  isSupportedFile(filePath: string): boolean;
  getCommand(): string[];
  getProjectMarkers(): string[];
}
```

Default language IDs:

```text
.ts, .mts, .cts -> typescript
.tsx -> typescriptreact
.js, .mjs, .cjs -> javascript
.jsx -> javascriptreact
```

The preset must honor configured extensions and project markers. Unsupported extensions return a typed routing or setup error before any LSP process starts.

## Project Routing

For active checks, routing uses this order:

```text
requested file
  -> resolveSafePath(file, roots)
  -> owning workspace root
  -> walk upward from file directory to root
  -> nearest tsconfig.json if present
  -> else nearest package.json if present
  -> else owning workspace root
```

The resulting project anchor is the session cache key.

Unlike Slice 3 path safety, project routing is filesystem-aware because it must check marker file existence. It must not read source file contents in this slice. It only checks marker paths with `stat` or equivalent filesystem metadata calls.

Routing errors should be typed and provider-friendly:

- `no_workspace_roots`
- `empty_path`
- `path_outside_workspace`
- `unsupported_file_type`
- `project_route_error`

## Session Lifecycle

Session manager responsibilities:

- Cache sessions by project anchor path.
- Return existing ready sessions for repeated active checks.
- Create a new session for a missing anchor.
- Store failed sessions with message and reason code.
- Expose aggregate health for passive provider calls.

Session responsibilities:

- Spawn configured command with args.
- Connect JSON-RPC to child stdout and stdin.
- Send `initialize` with process ID, root URI, workspace folders, and minimal client capabilities.
- Send `initialized` notification after initialize result.
- Store server capabilities from initialize result.
- Mark state `ready` after initialized notification succeeds.
- Mark state `failed` when spawn, connection, or initialize fails.
- Keep stdout reserved for MCP protocol. Any lifecycle logs must go to stderr only when logging exists in a future slice.

No idle timers or restart loops are needed in this slice. If the language server exits after startup, the session should mark `failed` and include an error message for health.

## Setup Validation

The MVP does not auto-install dependencies. Slice 4 should fail clearly when startup requirements are missing.

Validation behavior:

- Empty command array is `failed` with an invalid command message.
- Missing executable or spawn `ENOENT` is `failed` with a language server command message.
- Initialize failure is `failed` with an initialize message.
- Project-local `typescript` validation may be added in this slice if it can be done cleanly with package resolution from the project anchor. If it complicates initialization work, defer it to Slice 5 and document the deferral.

The important acceptance point is that missing `typescript-language-server` never crashes the MCP process and never writes to stdout.

## Config And Server Wiring

The CLI currently starts the static provider. Slice 4 should wire the real provider behind config loading and root resolution:

```text
cli/startStdioServer
  -> loadConfig()
  -> resolveWorkspaceRoots(config.roots, baseDir)
  -> create LspSemanticProvider(config, roots)
  -> createServer({ provider })
```

If config loading or root resolution fails during startup, the server should still start when possible and expose the setup problem through provider health. It should not exit unless server construction itself fails. This keeps MCP clients able to call `health` to inspect setup problems.

The provider can carry an initial setup error and return it through passive and active health.

## Testing

Unit tests should use mocked process and connection boundaries so normal `pnpm test` does not require `typescript-language-server` installed globally.

Tests should cover:

- TypeScript preset extension matching and language IDs.
- TypeScript preset honors configured extensions.
- Project routing picks nearest `tsconfig.json`.
- Project routing falls back to nearest `package.json`.
- Project routing falls back to owning root.
- Project routing rejects unsupported extensions.
- Session initializes and stores capabilities with mocked connection.
- Session marks failed on spawn or initialize failure.
- Session manager caches by project anchor.
- Passive health does not start a session.
- Active health starts and reports ready with mocked session manager.
- Active health reports setup errors without throwing.
- Passive capabilities reports implemented LSP state without startup.
- Active capabilities reports live capability summary after initialization.
- Existing Slice 1 through Slice 3 tests continue to pass.

Acceptance commands:

```sh
pnpm test
pnpm check
pnpm build
timeout 1s node dist/cli.js
```

The bounded CLI smoke should still produce no stdout logs outside MCP protocol output.

## Risks

- Starting a real process can make tests flaky. Keep process and JSON-RPC creation behind injectable boundaries for unit tests.
- Active checks can accidentally infer cwd as workspace root. Continue requiring configured roots and safe path resolution.
- LSP initialization can leak raw JSON into user-facing output. Keep formatting compact and plain text.
- Server startup can become fail-fast on config/root errors. Prefer health-visible setup failures so MCP clients can inspect them.
- Scope can creep into diagnostics. Do not read source files or send document sync notifications in this slice.

## Self-Review

- Placeholder scan: no placeholders remain.
- Scope check: focused on LSP initialization only; semantic tools and document sync are explicitly out of scope.
- Ambiguity check: active checks require `file`; no cwd workspace fallback is allowed.
- Consistency check: provider boundary remains the public internal seam, and MCP outputs stay structured plain text.
