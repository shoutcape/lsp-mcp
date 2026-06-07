# lsp-mcp

IDE semantics as MCP tools.

`lsp-mcp` is a planned harness-neutral MCP server that exposes language-server-backed code intelligence to coding agents. It is designed to complement agent harness tools such as file read, grep, glob, edit, and patch tools rather than replace them.

The MVP starts with TypeScript and JavaScript through `typescript-language-server`, while keeping the architecture open for additional language-server presets later.

## Status

Slice 1 scaffold is implemented. It provides a runnable MCP stdio server with static `health` and `capabilities` tools. Real LSP behavior is still future work.

See:

- `docs/superpowers/specs/2026-06-07-slice-1-mcp-scaffold-design.md`
- `docs/architecture.md`

## Development

Install dependencies:

```sh
pnpm install
```

Run tests:

```sh
pnpm test
```

Run checks:

```sh
pnpm check
```

Build:

```sh
pnpm build
```

Run a bounded local CLI smoke test after building:

```sh
timeout 1s node dist/cli.js
```

The smoke test times out because the MCP stdio server waits for protocol messages. It should not print logs to stdout.

## MVP Goals

- Provide compact semantic tools over MCP stdio.
- Use TypeScript/JavaScript as the first supported language family.
- Use LSP through `typescript-language-server` instead of direct `tsserver` for the MVP.
- Return structured plain text outputs instead of JSON-first payloads.
- Keep file editing and shell execution with the agent harness.
- Keep rename refactoring preview-only in the MVP.

## Planned Tools

Phase 1 foundation:

- `health`
- `capabilities`
- `diagnostics`
- `hover`
- `definition`

Phase 2 navigation:

- `type_definition`
- `references`
- `workspace_symbols`
- `document_symbols`
- `implementation`
- `signature_help`
- `call_hierarchy`

Phase 3 refactoring preview:

- `rename_preview`

## Out Of Scope For MVP

- File search, file read, file write, or patch tools.
- Code actions.
- Applying rename edits.
- Raw LSP method exposure.
- Custom symbol indexing.
- MCP resources.
- Direct editor language-server integration for VS Code, Neovim, or other editors.
- Automatic language server or dependency installation.

## Planned Package Shape

- Package: `@shoutcape/lsp-mcp`
- Binary: `lsp-mcp`
- Runtime: Node 20+
- Source: TypeScript compiled to ESM
- Transport: stdio MCP only
- Package manager: pnpm

## TypeScript MVP Requirements

The MCP server will expect:

- `typescript-language-server` available through a configured command or `PATH`.
- Project-local `typescript` installed in the target TypeScript project.

The server will not auto-install either dependency.
