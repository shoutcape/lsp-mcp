# lsp-mcp

IDE semantics as MCP tools.

`lsp-mcp` is a planned harness-neutral MCP server that exposes language-server-backed code intelligence to coding agents. It is designed to complement agent harness tools such as file read, grep, glob, edit, and patch tools rather than replace them.

The MVP starts with TypeScript and JavaScript through `typescript-language-server`, while keeping the architecture open for additional language-server presets later.

## Status

Slice 5 semantic tools are implemented. The server provides 6 MCP tools:

- `health` - Server and LSP health status
- `capabilities` - List available tools and LSP capabilities
- `goto_definition` - Jump to symbol definition (resolves through re-exports)
- `find_references` - Find all usages of a symbol across the project
- `hover` - Get inferred type and JSDoc documentation
- `diagnostics` - Get TypeScript errors and warnings for one or more files

See `docs/superpowers/specs/2026-06-08-slice-5-semantic-tools-design.md` and `docs/superpowers/plans/2026-06-08-slice-5-semantic-tools.md` for implementation details.

## Quick Start

Install globally:

```sh
npm install -g @shoutcape/lsp-mcp
```

Or use with npx in your MCP client config:

```json
{
  "mcpServers": {
    "lsp": {
      "command": "npx",
      "args": ["-y", "@shoutcape/lsp-mcp"],
      "env": {
        "LSP_WORKSPACE": "/path/to/your/project"
      }
    }
  }
}
```

Requirements:
- `typescript-language-server` available in PATH (`npm install -g typescript-language-server`)
- TypeScript installed in the target project (`npm install --save-dev typescript`)

See:

- `docs/superpowers/README.md`
- `docs/superpowers/specs/2026-06-07-slice-1-mcp-scaffold-design.md`
- `docs/superpowers/specs/2026-06-07-slice-2-provider-foundation-design.md`
- `docs/superpowers/specs/2026-06-07-slice-3-config-roots-safety-design.md`
- `docs/superpowers/specs/2026-06-07-slice-4-lsp-initialization-foundation-design.md`
- `docs/superpowers/specs/2026-06-08-slice-5-semantic-tools-design.md`
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
- `goto_definition`
- `find_references`

Phase 2 navigation:

- `type_definition`
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
