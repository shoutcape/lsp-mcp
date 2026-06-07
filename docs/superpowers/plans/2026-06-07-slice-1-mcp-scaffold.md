# Slice 1 MCP Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build smallest runnable `lsp-mcp` MCP stdio server with static `health` and `capabilities` tools.

**Architecture:** CLI starts the stdio MCP server. Server wiring registers tools. Tool modules return compact plain-text output so tests can verify behavior without launching an MCP client.

**Tech Stack:** Node 20, TypeScript ESM, pnpm, official MCP TypeScript SDK, Zod v4, Vitest, Biome.

---

## File Structure

- Create `package.json`: package metadata, CLI bin, scripts, runtime and dev dependencies.
- Create `tsconfig.json`: TypeScript ESM build config.
- Create `biome.json`: lint and format config.
- Create `src/cli.ts`: executable entrypoint that starts server and sends errors to stderr.
- Create `src/server.ts`: constructs MCP server, registers tools, connects stdio transport.
- Create `src/tools/health.ts`: static health output and tool result wrapper.
- Create `src/tools/capabilities.ts`: static capabilities output and tool result wrapper.
- Create `src/tools/text-result.ts`: shared helper for MCP text content results.
- Create `tests/tools/*.test.ts`: Vitest tests for tool output, kept outside `src` for clearer production/test separation.
- Modify `README.md`: document Slice 1 status and commands.
- Modify `Projects/lsp-mcp/lsp-mcp Slice 1 MCP Scaffold.md`: update status after implementation.

## Task 1: Tool Output Tests

Write failing tests for static `health` and `capabilities` output before production tool modules exist.

## Task 2: Package And Tooling Scaffold

Create `package.json`, `tsconfig.json`, `biome.json`, then run `pnpm install`.

## Task 3: Static Tool Modules

Create text result helper plus `health` and `capabilities` modules, then verify tests pass.

## Task 4: MCP Server And CLI

Create MCP server wiring and CLI entrypoint, then verify TypeScript build passes.

## Task 5: README And Obsidian Update

Update README development commands and Obsidian Slice 1 status after verification.

## Task 6: Verification

Run `pnpm test`, `pnpm check`, `pnpm build`, a bounded `node dist/cli.js` smoke test, and inspect `git diff --stat`.

## Self-Review

- Spec coverage: package, CLI, MCP stdio server, static tools, tests, Biome, README, and Obsidian docs are covered.
- Placeholder scan: no placeholders remain.
- Type consistency: tool function names match imports across tasks.
- Scope check: real LSP, routing, config, diagnostics, hover, definition, and path safety remain excluded.
