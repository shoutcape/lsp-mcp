# Slice 3 Config Roots Safety Design

Date: 2026-06-07
Status: approved for planning

## Purpose

Slice 3 adds the runtime foundation needed before any language-server session can safely read files or start processes. It loads optional JSONC config, resolves explicit workspace roots, and confines requested paths to those roots.

This slice still does not start `typescript-language-server`, sync documents, parse MCP Roots from clients, or add semantic tools such as `diagnostics`, `hover`, or `definition`.

## Scope

Build:

- Optional `lsp-mcp.config.jsonc` loading.
- JSONC parsing with comments and trailing commas supported by `jsonc-parser`.
- Zod validation for the config input shape.
- Deep merge from partial user config into `defaultConfig`.
- Typed config load results for success and normal setup errors.
- Workspace root resolution from config roots only.
- Explicit setup error when no roots are available.
- Relative root resolution against the config directory or explicit base directory.
- Absolute root preservation.
- Path safety helper for future file-based tools and document sync.
- Rejection of empty paths, `..` escapes, and absolute paths outside allowed roots.
- Unit tests for config loading, root resolution, and path safety.
- README status update after implementation.

Do not build:

- Real LSP startup.
- `vscode-jsonrpc` or `vscode-languageserver-protocol` dependencies.
- MCP Roots negotiation.
- CLI flags or env var overrides.
- Filesystem symlink escape checks.
- File reading for semantic requests.
- `diagnostics`, `hover`, `definition`, or any other new MCP tools.
- Changes to public `health` or `capabilities` output.

## Architecture

Slice 3 adds three small foundations beside the Slice 2 provider scaffold:

```text
config/load-config
  -> parse optional lsp-mcp.config.jsonc
  -> validate partial config input
  -> merge with defaultConfig

workspace/resolve-roots
  -> convert config roots into absolute WorkspaceRoot records
  -> report missing roots explicitly

safety/path-safety
  -> resolve requested file paths under allowed roots
  -> reject outside-root requests
```

Existing MCP server construction stays unchanged except for exports being available to future slices. The CLI still starts the static provider-backed MCP server and emits no stdout logs outside protocol messages.

## Config Loading

The optional config filename is `lsp-mcp.config.jsonc`.

The loader accepts explicit options so tests and future CLI code can avoid cwd guessing:

```ts
export interface LoadConfigOptions {
  configPath?: string;
  baseDir?: string;
}
```

Behavior:

- If `configPath` is provided and exists, load that file.
- If `configPath` is provided and missing, return a typed config error.
- If `configPath` is omitted, look for `lsp-mcp.config.jsonc` in `baseDir`.
- If `baseDir` is omitted, use `process.cwd()` only for config-file lookup. This is not workspace root fallback.
- If no config file exists at the lookup path, return `defaultConfig` and the lookup directory as `baseDir`.
- If config exists but contains invalid JSONC, return a typed config error.
- If config exists but schema validation fails, return a typed config error.
- If config exists and is valid, deep merge it into `defaultConfig`.

Using `process.cwd()` here is acceptable only for locating an optional config file when no explicit `baseDir` is supplied. Workspace root resolution still must not infer roots from cwd.

## Config Shape

The existing `LspMcpConfig` stays the fully-resolved internal config shape.

Slice 3 adds partial input types and schema validation:

```ts
export type LspMcpConfigInput = DeepPartial<LspMcpConfig>;
```

Supported user fields match the existing config structure:

- `roots`
- `languages.typescript.enabled`
- `languages.typescript.command`
- `languages.typescript.extensions`
- `languages.typescript.projectMarkers`
- `sessions.idleTimeoutMs`
- `sessions.restartOnCrash`
- `output.defaultLimit`

Unknown fields should fail validation. This prevents silent typos in setup files.

## Root Resolution

Root resolution consumes resolved config and an explicit base directory:

```ts
export interface ResolveWorkspaceRootsOptions {
  roots: string[];
  baseDir: string;
}
```

Behavior:

- Empty root list returns `{ ok: false, error: { code: "no_workspace_roots" } }`.
- Relative roots resolve against `baseDir`.
- Absolute roots stay absolute.
- Names are not inferred in this slice.
- Root paths are normalized syntactically with Node path utilities.
- No filesystem existence check in this slice.
- No symlink resolution in this slice.

This preserves the architecture rule: if no root exists, setup fails instead of guessing from process cwd.

## Path Safety

Path safety accepts a user path and allowed roots:

```ts
export interface ResolveSafePathOptions {
  requestedPath: string;
  roots: WorkspaceRoot[];
}
```

Behavior:

- Empty path returns `empty_path`.
- Empty roots returns `no_workspace_roots`.
- Relative requested paths are resolved against each root until one is contained.
- Absolute requested paths must be inside one allowed root.
- `..` path escapes are rejected.
- Paths that normalize outside every root return `path_outside_workspace`.
- The success result returns the matched root and normalized absolute path.

The helper does not read files. It is pure and deterministic. Symlink escape rejection remains a future filesystem-aware safety step before any real document sync reads from disk.

## Error Model

Normal invalid input should return typed result objects, not throw.

Config load errors:

- `config_not_found`
- `config_parse_error`
- `config_validation_error`
- `config_read_error`

Root and path safety errors:

- `no_workspace_roots`
- `empty_path`
- `path_outside_workspace`

Unexpected programmer errors may still throw, but tests should cover normal bad user/setup input as typed results.

## Dependency

Add pinned runtime dependency:

```text
jsonc-parser@3.3.1
```

`zod` is already present and remains pinned.

## Testing

Tests should cover:

- Missing config file returns defaults.
- JSONC comments parse correctly.
- Partial config merges with defaults.
- Invalid JSONC returns `config_parse_error`.
- Invalid schema returns `config_validation_error`.
- Explicit missing config path returns `config_not_found`.
- Empty config roots return `no_workspace_roots`.
- Relative roots resolve against base directory.
- Absolute roots remain absolute.
- Relative file paths resolve inside a root.
- Absolute inside-root paths resolve successfully.
- `..` escapes are rejected.
- Absolute outside-root paths are rejected.
- Existing `health` and `capabilities` tests continue to pass unchanged.

Acceptance commands:

```sh
pnpm test
pnpm check
pnpm build
timeout 1s node dist/cli.js
```

The bounded CLI smoke should still produce no stdout logs outside MCP protocol output.

## Risks

- Config loading can accidentally imply workspace cwd fallback. Keep config lookup separate from root resolution.
- Path safety can become too filesystem-aware too early. Keep this slice pure and defer symlink checks until file reads are introduced.
- Deep merge can accidentally replace nested defaults. Tests must prove partial config retains defaults.
- Unknown config fields can silently hide typos. Use strict Zod object schemas.

## Self-Review

- Placeholder scan: no placeholders remain.
- Scope check: focused on config loading, explicit roots, and pure path safety.
- Ambiguity check: LSP startup, MCP Roots, CLI/env overrides, symlink checks, and semantic tools are explicitly out of scope.
- Consistency check: workspace roots still never fall back to cwd, while config lookup may use cwd only to find the optional config file.
