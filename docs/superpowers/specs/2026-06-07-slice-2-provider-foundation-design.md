# Slice 2 Provider Foundation Design

Date: 2026-06-07
Status: approved for planning

## Purpose

Slice 2 adds the internal provider boundary that future language-server behavior will use, while keeping runtime behavior static. This lets the current `health` and `capabilities` tools depend on a stable `SemanticProvider` interface before real LSP startup, root resolution, and semantic tools are added.

The slice also introduces config defaults and a small workspace root model. These are pure data boundaries only. They do not parse config files, read MCP roots, start language servers, or perform filesystem safety checks yet.

## Scope

Build:

- `SemanticProvider` interface for current foundation operations.
- Provider result types for health and capabilities.
- `StaticSemanticProvider` that preserves Slice 1 behavior.
- Provider-backed `health` and `capabilities` tool handlers.
- Dependency injection in server construction so tests can pass a provider.
- Config type definitions and default config values.
- Workspace root data model helpers for future root resolution.
- Unit tests for provider behavior, config defaults, workspace root helpers, and provider-backed MCP wiring.
- README status update for Slice 2 if implementation is completed in the same branch.

Do not build:

- Real `typescript-language-server` startup.
- `vscode-jsonrpc` or `vscode-languageserver-protocol` dependencies.
- LSP session manager.
- `health check=true` or live capabilities checks.
- Config file parsing from `lsp-mcp.config.jsonc`.
- MCP Roots negotiation.
- Filesystem path confinement checks.
- `diagnostics`, `hover`, or `definition` tools.
- Any file editing or code action behavior.

## Architecture

Slice 2 changes the current static scaffold into a provider-backed scaffold:

```text
MCP client
  -> lsp-mcp server
    -> tool handler
      -> SemanticProvider
        -> StaticSemanticProvider
```

`src/server.ts` remains responsible for constructing the MCP server and registering tools. It accepts optional dependencies, including a `SemanticProvider`, and defaults to `StaticSemanticProvider` for CLI use.

`src/tools/health.ts` and `src/tools/capabilities.ts` become small adapters. They call provider methods and format the returned data as stable plain text.

Provider implementation is intentionally boring. It returns the same Slice 1 text semantics through typed data, not through hardcoded final tool strings.

## Provider Contract

The `SemanticProvider` interface covers only the current implemented tools:

```ts
export interface SemanticProvider {
  getHealth(): Promise<HealthInfo>;
  getCapabilities(): Promise<CapabilitiesInfo>;
}
```

`HealthInfo` uses the final health vocabulary:

```ts
export type HealthStatus =
  | "not_started"
  | "starting"
  | "ready"
  | "degraded"
  | "failed";

export interface HealthInfo {
  status: HealthStatus;
  message: string;
}
```

`CapabilitiesInfo` lists supported MCP tools and whether LSP is implemented:

```ts
export interface CapabilitiesInfo {
  status: HealthStatus;
  supportedTools: string[];
  lsp: "not_implemented" | "implemented";
}
```

The static provider returns:

```text
Health status: not_started
Health message: LSP sessions are not implemented in this scaffold.
Capabilities status: ready
Supported tools: health, capabilities
LSP: not_implemented
```

## Tool Output

Public tool output remains structured plain text and should preserve Slice 1 wording except where provider-backed formatting makes wording clearer.

Expected `health` output:

```text
Status: not_started
Tool: health
Message: LSP sessions are not implemented in this scaffold.
```

Expected `capabilities` output:

```text
Status: ready
Tool: capabilities
Supported tools: health, capabilities
LSP: not implemented
```

The public output must not expose raw provider objects or JSON.

## Config Defaults

Config in this slice is types and defaults only. It creates a stable shape for future parsing:

```ts
export interface LspMcpConfig {
  roots: string[];
  languages: {
    typescript: TypeScriptLanguageConfig;
  };
  sessions: {
    idleTimeoutMs: number;
    restartOnCrash: boolean;
  };
  output: {
    defaultLimit: number;
  };
}
```

Default config:

```text
roots: []
typescript enabled: true
typescript command: ["typescript-language-server", "--stdio"]
typescript extensions: .ts .tsx .js .jsx .mjs .cjs .mts .cts
typescript project markers: tsconfig.json package.json
session idle timeout: 900000
restart on crash: true
default output limit: 50
```

No code in this slice should read `lsp-mcp.config.jsonc` from disk.

## Workspace Root Model

The workspace layer introduces pure root records that future path safety and routing can consume:

```ts
export interface WorkspaceRoot {
  name?: string;
  path: string;
}
```

Helpers may normalize root input into records, but must not perform filesystem reads or symlink resolution yet. This keeps the slice deterministic and easy to test.

The root model should represent an empty root set explicitly. Per the approved architecture, the full server must not guess from process cwd when no root exists. This slice only models that state; it does not enforce setup errors in tool output yet.

## Testing

Tests should cover:

- `StaticSemanticProvider.getHealth()` returns `not_started` and the scaffold message.
- `StaticSemanticProvider.getCapabilities()` returns `ready`, `health`, `capabilities`, and `not_implemented` LSP state.
- `health` tool formatting uses provider output.
- `capabilities` tool formatting uses provider output.
- MCP server accepts an injected provider and calls through it.
- Default config matches approved defaults.
- Workspace root helpers return explicit empty roots and normalized root records.

Acceptance commands:

```sh
pnpm test
pnpm check
pnpm build
timeout 1s node dist/cli.js
```

The bounded CLI smoke should still produce no stdout logs outside MCP protocol output.

## Risks

- Provider types can grow too broad too early. Keep only current implemented operations in this slice.
- Config parsing can creep into scope. Keep config as data only until a later config/root-resolution slice.
- Root helpers can accidentally imply cwd fallback. Keep empty root state explicit and do not use cwd as a default root.
- Tool output changes could break Slice 1 tests. Preserve public text output.

## Self-Review

- Placeholder scan: no placeholders remain.
- Scope check: focused on provider foundation, config defaults, and root model only.
- Ambiguity check: real LSP, config parsing, MCP Roots, path safety, and semantic tools are explicitly out of scope.
- Consistency check: tool names, statuses, and default values match the approved architecture and Slice 1 output.
