# Slice Documentation

This directory tracks slice specs and implementation plans for `lsp-mcp`.

## Current Slice

Slice 6 zero-config workspace inference is implemented. The server no longer requires explicit workspace roots and infers the TypeScript project root from the requested file path.

## Slice Index

| Slice | Status | Spec | Plan | Obsidian mirror |
| --- | --- | --- | --- | --- |
| Slice 1 MCP Scaffold | Implemented | [spec](specs/2026-06-07-slice-1-mcp-scaffold-design.md) | [plan](plans/2026-06-07-slice-1-mcp-scaffold.md) | `Projects/lsp-mcp/lsp-mcp Slice 1 MCP Scaffold.md` |
| Slice 2 Provider Foundation | Implemented | [spec](specs/2026-06-07-slice-2-provider-foundation-design.md) | [plan](plans/2026-06-07-slice-2-provider-foundation.md) | `Projects/lsp-mcp/lsp-mcp Slice 2 Provider Foundation.md` |
| Slice 3 Config Roots Safety | Implemented | [spec](specs/2026-06-07-slice-3-config-roots-safety-design.md) | [plan](plans/2026-06-07-slice-3-config-roots-safety.md) | Not created yet |
| Slice 4 LSP Initialization Foundation | Implemented | [spec](specs/2026-06-07-slice-4-lsp-initialization-foundation-design.md) | [plan](plans/2026-06-07-slice-4-lsp-initialization-foundation.md) | `Projects/lsp-mcp/lsp-mcp Slice 4 LSP Initialization Foundation.md` |
| Slice 5 Semantic Tools | Implemented | [spec](specs/2026-06-08-slice-5-semantic-tools-design.md) | [plan](plans/2026-06-08-slice-5-semantic-tools.md) | Not created yet |
| Slice 6 Zero-Config Workspace Inference | Implemented | [spec](specs/2026-06-09-slice-6-zero-config-workspace-inference-design.md) | [plan](plans/2026-06-09-slice-6-zero-config-workspace-inference.md) | Not created yet |

## Tracking Rule

Every slice should have both repo documentation and an Obsidian project note:

- Repo spec under `docs/superpowers/specs/`.
- Repo implementation plan under `docs/superpowers/plans/`.
- Obsidian mirror under `Projects/lsp-mcp/` linked from `Projects/lsp-mcp/lsp-mcp.md`.
