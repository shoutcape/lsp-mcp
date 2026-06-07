# Slice 1 MCP Scaffold Design

Date: 2026-06-07
Status: approved for implementation

## Purpose

Slice 1 creates the smallest runnable `lsp-mcp` package so we can understand the MCP server shape before adding language-server behavior.

The slice is intentionally static. It proves package setup, CLI startup, MCP stdio transport, tool registration, testing, and documentation workflow.

## Scope

Build:

- Node 20 TypeScript package compiled to ESM.
- Package name `@shoutcape/lsp-mcp`.
- CLI binary named `lsp-mcp`.
- MCP stdio server using the official MCP TypeScript SDK.
- Static `health` tool.
- Static `capabilities` tool.
- Vitest test setup.
- Biome lint and format setup.
- README update describing how to run and test the scaffold.
- Obsidian project documentation under `Projects/lsp-mcp/`.

Do not build:

- Real `typescript-language-server` startup.
- LSP JSON-RPC session manager.
- File routing or workspace root resolution.
- `diagnostics`, `hover`, or `definition`.
- Config loading from `lsp-mcp.config.jsonc`.
- Path safety enforcement beyond documenting future requirements.

## Tool Behavior

### `health`

`health` returns structured plain text:

```text
Status: not_started
Tool: health
Message: LSP sessions are not implemented in this scaffold.
```

This matches the final health vocabulary while making clear that no LSP session exists yet.

### `capabilities`

`capabilities` returns structured plain text listing scaffold capabilities:

```text
Status: ready
Tool: capabilities
Supported tools: health, capabilities
LSP: not implemented
```

It reports only the tools that exist in Slice 1. It does not claim support for Phase 1 semantic tools.

## Architecture

The scaffold uses four small units:

- `src/cli.ts` starts the server and keeps stdout reserved for MCP protocol messages.
- `src/server.ts` constructs the MCP server, registers tools, and connects stdio transport.
- `src/tools/health.ts` owns `health` output.
- `src/tools/capabilities.ts` owns `capabilities` output.

This keeps MCP wiring separate from tool output. Later slices can replace static tool output with calls into `SemanticProvider` without changing the CLI boundary.

## Testing

Tests focus on code that can be tested without an MCP client process:

- `health` output contains stable headings and `not_started` status.
- `capabilities` output lists only `health` and `capabilities`.
- Tool modules return plain text, not JSON objects.

Full MCP stdio smoke testing is deferred until the CLI exists and dependency setup is stable.

## Documentation

Repo docs should explain:

- How to install dependencies.
- How to run tests.
- How to build.
- What Slice 1 supports.
- What remains future work.

Obsidian docs should explain:

- Project purpose.
- Slice 1 learning goals.
- Architecture vocabulary in beginner-friendly terms.
- Current exclusions so future work is not confused with missing behavior.

## Acceptance Criteria

- `pnpm test` passes.
- `pnpm build` passes.
- `pnpm lint` or `pnpm check` passes, depending on final script naming.
- `node dist/cli.js` can start the MCP server without writing logs to stdout after `pnpm build`.
- README documents Slice 1 status and commands.
- Obsidian has linked notes under `Projects/lsp-mcp/`.

## Risks

- MCP SDK APIs may differ from memory. Resolve by checking installed package types during implementation.
- CLI smoke testing over stdio can hang if run naively. Use a bounded command or defer full protocol smoke until a later slice.
- Logging to stdout would corrupt MCP protocol. Keep stdout reserved for MCP messages only.

## Self-Review

- Placeholder scan: no placeholders remain.
- Scope check: focused on scaffold only.
- Ambiguity check: tool outputs and exclusions are explicit.
- Consistency check: names match existing repo docs and approved design.
