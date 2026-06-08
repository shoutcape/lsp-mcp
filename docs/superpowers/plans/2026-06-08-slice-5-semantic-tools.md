# Slice 5 Semantic Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first TypeScript semantic MCP tools: `goto_definition`, `find_references`, `hover`, and `diagnostics`.

**Architecture:** Existing MCP tools call the `SemanticProvider` boundary. `LspSemanticProvider` ensures a routed `LspSession`, syncs requested files from disk with full-document LSP notifications, executes semantic LSP requests, and formats normalized provider results through MCP tool handlers. `LspSession` owns the JSON-RPC connection, document sync helper, and push diagnostics store.

**Tech Stack:** Node 20, TypeScript ESM, pnpm, official MCP TypeScript SDK, Zod v4, `vscode-jsonrpc@8.2.1`, `vscode-languageserver-protocol@3.17.5`, `typescript-language-server`, Vitest, Biome.

---

## File Structure

- Modify `package.json`: keep `typescript-language-server` as dev dependency for integration tests.
- Modify `pnpm-lock.yaml`: lock integration-test language server dependency.
- Modify `.gitignore`: ignore fixture `node_modules`.
- Modify `src/providers/semantic-provider.ts`: add file-location, definition, references, hover, and diagnostics result contracts.
- Modify `src/providers/static-semantic-provider.ts`: implement no-op semantic methods for injected/static test provider compatibility.
- Modify `src/providers/lsp-semantic-provider.ts`: implement definition, references, hover, diagnostics, and updated supported tool list.
- Modify `src/lsp/types.ts`: add notification handler support to the connection abstraction.
- Modify `src/lsp/session.ts`: create document sync and diagnostics store after initialization, expose accessors, register publish diagnostics handler, and clean up state on stop/failure/exit.
- Modify `src/lsp/session-manager.ts`: expose session-like methods needed by provider semantic calls.
- Create `src/lsp/document-sync.ts`: read file content, hash it, send `didOpen` or full-document `didChange`.
- Create `src/lsp/diagnostics-store.ts`: store and wait for pushed diagnostics by URI.
- Create `src/lsp/semantic-requests.ts`: thin wrappers around definition, references, and hover LSP requests.
- Create `src/tools/definition.ts`: format and handle `goto_definition`.
- Create `src/tools/references.ts`: format and handle `find_references`.
- Create `src/tools/hover.ts`: format and handle `hover`.
- Create `src/tools/diagnostics.ts`: format and handle `diagnostics`.
- Modify `src/server.ts`: register the four semantic tools and input schemas.
- Create `tests/lsp/document-sync.test.ts`: document sync notification behavior.
- Create `tests/lsp/diagnostics-store.test.ts`: diagnostics storage and timeout behavior.
- Create `tests/lsp/semantic-requests.test.ts`: raw LSP method request wrappers.
- Modify `tests/lsp/session.test.ts`: verify diagnostics client capability, notification registration, and cleanup.
- Modify `tests/lsp/session-manager.test.ts`: update session-like test doubles.
- Modify `tests/providers/lsp-semantic-provider.test.ts`: verify supported tool list includes semantic tools.
- Create `tests/tools/definition.test.ts`: definition formatting and handler behavior.
- Create `tests/tools/references.test.ts`: references formatting and handler behavior.
- Create `tests/tools/hover.test.ts`: hover formatting and handler behavior.
- Create `tests/tools/diagnostics.test.ts`: diagnostics formatting and handler behavior.
- Modify `tests/server.test.ts`: assert all six MCP tools are registered.
- Create `tests/fixtures/sample-project/`: small TypeScript project with valid and broken files.
- Create `tests/integration/semantic-tools.test.ts`: real TypeScript LSP integration coverage.
- Modify `README.md`: update Slice 5 status and docs links.
- Modify `docs/superpowers/README.md`: add Slice 5 to slice index.

## Task 1: Provider Contract And Static Provider

**Files:**
- Modify: `src/providers/semantic-provider.ts`
- Modify: `src/providers/static-semantic-provider.ts`
- Test: existing provider and server tests

- [ ] **Step 1: Extend provider types**

Add `FileLocation`, `DefinitionResult`, `ReferencesResult`, `HoverResult`, `DiagnosticsRequest`, and `DiagnosticsResult` to `src/providers/semantic-provider.ts`.

- [ ] **Step 2: Add provider methods**

Extend `SemanticProvider` with:

```ts
getDefinition(location: FileLocation): Promise<DefinitionResult>;
getReferences(location: FileLocation): Promise<ReferencesResult>;
getHover(location: FileLocation): Promise<HoverResult>;
getDiagnostics(request: DiagnosticsRequest): Promise<DiagnosticsResult>;
```

- [ ] **Step 3: Add no-op static implementations**

Return empty results from `StaticSemanticProvider` so existing tests using static/injected providers keep working.

- [ ] **Step 4: Run focused tests**

Run: `pnpm test tests/providers/lsp-semantic-provider.test.ts tests/server.test.ts`

Expected: existing tests either pass or fail only where test doubles need new methods.

## Task 2: Document Sync

**Files:**
- Create: `src/lsp/document-sync.ts`
- Test: `tests/lsp/document-sync.test.ts`

- [ ] **Step 1: Write document sync tests**

Cover first access `didOpen`, changed content `didChange`, and unchanged content no-op behavior.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test tests/lsp/document-sync.test.ts`

Expected: FAIL before `DocumentSync` exists.

- [ ] **Step 3: Implement `DocumentSync`**

Use `fs/promises.readFile`, `sha256` content hashing, `pathToFileURL`, `DidOpenTextDocumentNotification.type`, and `DidChangeTextDocumentNotification.type`.

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test tests/lsp/document-sync.test.ts`

Expected: PASS.

## Task 3: Diagnostics Store

**Files:**
- Create: `src/lsp/diagnostics-store.ts`
- Test: `tests/lsp/diagnostics-store.test.ts`

- [ ] **Step 1: Write diagnostics store tests**

Cover storing diagnostics, unknown URI empty result, wait resolving on notification, immediate wait for existing diagnostics, and timeout empty result.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test tests/lsp/diagnostics-store.test.ts`

Expected: FAIL before store exists.

- [ ] **Step 3: Implement `DiagnosticsStore`**

Store latest diagnostics in `Map<string, Diagnostic[]>`; keep bounded waiters; clear timeouts and resolve waiters on matching notification or clear.

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test tests/lsp/diagnostics-store.test.ts`

Expected: PASS.

## Task 4: Semantic Request Wrappers

**Files:**
- Create: `src/lsp/semantic-requests.ts`
- Test: `tests/lsp/semantic-requests.test.ts`

- [ ] **Step 1: Write request wrapper tests**

Verify `textDocument/definition`, `textDocument/references` with `includeDeclaration: true`, and `textDocument/hover` request params.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test tests/lsp/semantic-requests.test.ts`

Expected: FAIL before wrappers exist.

- [ ] **Step 3: Implement wrappers**

Use `DefinitionRequest.type`, `ReferencesRequest.type`, and `HoverRequest.type` from `vscode-languageserver-protocol`.

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test tests/lsp/semantic-requests.test.ts`

Expected: PASS.

## Task 5: Session Wiring

**Files:**
- Modify: `src/lsp/types.ts`
- Modify: `src/lsp/session.ts`
- Modify: `src/lsp/session-manager.ts`
- Test: `tests/lsp/session.test.ts`
- Test: `tests/lsp/session-manager.test.ts`

- [ ] **Step 1: Add connection notification handler contract**

Add `onNotification(method, handler)` to `LspConnection`.

- [ ] **Step 2: Register diagnostics capability and handler**

During initialize, include publish diagnostics client capability. After ready, create `DiagnosticsStore` and `DocumentSync`, then register `PublishDiagnosticsNotification.type`.

- [ ] **Step 3: Expose semantic session helpers**

Add `getConnection()`, `getDiagnosticsStore()`, and `prepareFile(filePath, languageId)` access through session and session-like manager types.

- [ ] **Step 4: Clean up new state**

Clear document sync and diagnostics store on `stop`, failed initialization, and process exit.

- [ ] **Step 5: Run focused tests**

Run: `pnpm test tests/lsp/session.test.ts tests/lsp/session-manager.test.ts`

Expected: PASS.

## Task 6: LSP Provider Semantic Methods

**Files:**
- Modify: `src/providers/lsp-semantic-provider.ts`
- Test: `tests/providers/lsp-semantic-provider.test.ts`

- [ ] **Step 1: Update supported tool list**

Return `health`, `capabilities`, `goto_definition`, `find_references`, `hover`, and `diagnostics` from capabilities.

- [ ] **Step 2: Implement `getDefinition`**

Ensure session, prepare file, send definition request, normalize `Location` and `LocationLink` results to one-based entries.

- [ ] **Step 3: Implement `getReferences`**

Ensure session, prepare file, send references request, map locations to one-based entries with conservative flags.

- [ ] **Step 4: Implement `getHover`**

Ensure session, prepare file, send hover request, flatten string, markup, and array contents.

- [ ] **Step 5: Implement `getDiagnostics`**

For each requested file, ensure session, clear diagnostics store, prepare file, wait for diagnostics, and map severity/code/message.

- [ ] **Step 6: Run focused tests**

Run: `pnpm test tests/providers/lsp-semantic-provider.test.ts`

Expected: PASS.

## Task 7: MCP Tool Modules And Server Registration

**Files:**
- Create: `src/tools/definition.ts`
- Create: `src/tools/references.ts`
- Create: `src/tools/hover.ts`
- Create: `src/tools/diagnostics.ts`
- Modify: `src/server.ts`
- Test: `tests/tools/definition.test.ts`
- Test: `tests/tools/references.test.ts`
- Test: `tests/tools/hover.test.ts`
- Test: `tests/tools/diagnostics.test.ts`
- Test: `tests/server.test.ts`

- [ ] **Step 1: Write tool formatter tests**

Cover empty and non-empty text output for each new tool.

- [ ] **Step 2: Implement tool modules**

Each tool should call the corresponding provider method and return `textResult(formattedText)`.

- [ ] **Step 3: Register MCP tools**

Add input schemas and register `goto_definition`, `find_references`, `hover`, and `diagnostics` in `createServer`.

- [ ] **Step 4: Run focused tests**

Run: `pnpm test tests/tools/definition.test.ts tests/tools/references.test.ts tests/tools/hover.test.ts tests/tools/diagnostics.test.ts tests/server.test.ts`

Expected: PASS.

## Task 8: Real TypeScript Integration Fixture

**Files:**
- Create: `tests/fixtures/sample-project/package.json`
- Create: `tests/fixtures/sample-project/package-lock.json`
- Create: `tests/fixtures/sample-project/tsconfig.json`
- Create: `tests/fixtures/sample-project/src/index.ts`
- Create: `tests/fixtures/sample-project/src/utils.ts`
- Create: `tests/fixtures/sample-project/src/broken.ts`
- Create: `tests/integration/semantic-tools.test.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Add sample TypeScript project**

Create small files where `index.ts` imports `add` from `utils.ts`, and `broken.ts` contains one type error.

- [ ] **Step 2: Add real LSP integration tests**

Start `typescript-language-server --stdio` from `node_modules/.bin`, initialize `LspSession`, prepare files, and verify definition, references, hover, and diagnostics.

- [ ] **Step 3: Ignore fixture dependencies**

Add `tests/fixtures/**/node_modules/` to `.gitignore`.

- [ ] **Step 4: Run integration test**

Run: `pnpm test tests/integration/semantic-tools.test.ts`

Expected: PASS when dependencies are installed.

## Task 9: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/README.md`
- Create: `docs/superpowers/specs/2026-06-08-slice-5-semantic-tools-design.md`
- Create: `docs/superpowers/plans/2026-06-08-slice-5-semantic-tools.md`

- [ ] **Step 1: Update README status**

State that Slice 5 semantic tools are implemented and list all six MCP tools.

- [ ] **Step 2: Update docs index**

Add Slice 5 spec and plan links to `docs/superpowers/README.md`.

- [ ] **Step 3: Run full verification**

Run: `pnpm test`

Expected: PASS.

Run: `pnpm check`

Expected: PASS.

Run: `pnpm build`

Expected: PASS.

Run: `timeout 1s node dist/cli.js`

Expected: timeout is acceptable because stdio server waits for MCP messages; no non-protocol stdout logs should appear.

## Notes For Current Worktree

Slice 5 appears partly implemented before this plan was written. Use this plan as the desired final-state checklist. If implementation already satisfies a step, verify it and check it off rather than rewriting working code.

## Self-Review

- Placeholder scan: no placeholders remain.
- Scope check: plan covers document sync, push diagnostics, definition, references, hover, diagnostics, and docs only.
- Test check: every behavior has unit or integration coverage.
- Risk check: pull diagnostics, relative paths, snippets, filtering, and broader navigation tools stay out of scope.
