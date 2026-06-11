# Slice 10: Phase 2 Navigation Tools - Implementation Plan

Date: 2026-06-11
Branch: vk/slice-10/navigation-tools
Spec: docs/superpowers/specs/2026-06-11-slice-10-navigation-tools-design.md

## Overview

Implement five missing Phase 2 navigation tools:
- `type_definition`, `implementation`, `document_symbols`, `workspace_symbols`, `signature_help`

Each follows the same layered pattern: LSP request helper -> provider method -> tool formatter -> server registration.

TDD throughout: write failing tests before each implementation unit.

## Task 1: LSP Request Helpers

**Files:**
- `src/lsp/semantic-requests.ts` (edit)
- `tests/lsp/semantic-requests.test.ts` (edit)

**Tests to add (write first):**
- `requestTypeDefinition` sends `textDocument/typeDefinition` with `{ textDocument: { uri }, position }`
- `requestImplementation` sends `textDocument/implementation` with `{ textDocument: { uri }, position }`
- `requestDocumentSymbol` sends `textDocument/documentSymbol` with `{ textDocument: { uri } }`
- `requestWorkspaceSymbol` sends `workspace/symbol` with `{ query }`
- `requestSignatureHelp` sends `textDocument/signatureHelp` with `{ textDocument: { uri }, position }`

**Implementation:**
Import from `vscode-languageserver-protocol`:
- `TypeDefinitionRequest`, `ImplementationRequest`, `DocumentSymbolRequest`
- `WorkspaceSymbolRequest`, `SignatureHelpRequest`

Add five functions matching existing pattern (one `connection.sendRequest` each).

**Commit:** `feat(slice-10): LSP request helpers for type_definition, implementation, document_symbols, workspace_symbols, signature_help`

## Task 2: Provider Interface + Result Types + Static Stubs

**Files:**
- `src/providers/semantic-provider.ts` (edit)
- `src/providers/static-semantic-provider.ts` (edit)
- `tests/providers/static-semantic-provider.test.ts` (create or edit)

**Tests to add (write first):**
- StaticSemanticProvider.getTypeDefinition returns `{ locations: [] }`
- StaticSemanticProvider.getImplementation returns `{ locations: [] }`
- StaticSemanticProvider.getDocumentSymbols returns `{ symbols: [] }`
- StaticSemanticProvider.getWorkspaceSymbols returns `{ symbols: [] }`
- StaticSemanticProvider.getSignatureHelp returns `{ signatures: [], activeSignature: 0, activeParameter: 0 }`

**Implementation:**

Add to `semantic-provider.ts`:
```typescript
export interface TypeDefinitionResult { locations: DefinitionEntry[] }
export interface ImplementationResult { locations: DefinitionEntry[] }

export type SymbolKindName = string

export interface DocumentSymbolEntry {
  name: string
  kind: SymbolKindName
  line: number
  column: number
  endLine: number
  endColumn: number
  containerName?: string
  children?: DocumentSymbolEntry[]
}
export interface DocumentSymbolsResult { symbols: DocumentSymbolEntry[] }

export interface WorkspaceSymbolEntry {
  name: string
  kind: SymbolKindName
  file: string
  line: number
  column: number
  containerName?: string
}
export interface WorkspaceSymbolsRequest {
  query: string
  limit?: number
}
export interface WorkspaceSymbolsResult {
  symbols: WorkspaceSymbolEntry[]
  caveats?: string[]
}

export interface SignatureParameter {
  label: string
  documentation?: string
}
export interface SignatureInfo {
  label: string
  documentation?: string
  parameters: SignatureParameter[]
}
export interface SignatureHelpResult {
  signatures: SignatureInfo[]
  activeSignature: number
  activeParameter: number
}
```

Add 5 methods to `SemanticProvider` interface.

**Commit:** `feat(slice-10): provider interface types and static stubs for navigation tools`

## Task 3: getTypeDefinition + getImplementation + mapLocations helper

**Files:**
- `src/providers/lsp-semantic-provider.ts` (edit)
- `tests/providers/lsp-semantic-provider.test.ts` (edit)

**Tests to add (write first):**
- `getTypeDefinition`: mock connection returns LSP Location; result has 1-based coords.
- `getTypeDefinition`: mock returns null; result is `{ locations: [] }`.
- `getImplementation`: same two test shapes.
- `getDefinition` still passes after extracting `mapLocations` helper (regression).

**Implementation:**
1. Extract `mapLocations(result)` from `getDefinition` - shared helper that converts `Definition | null` to `DefinitionEntry[]`.
2. Refactor `getDefinition` to call `mapLocations`.
3. Implement `getTypeDefinition` and `getImplementation` using `mapLocations`.

**Commit:** `feat(slice-10): getTypeDefinition and getImplementation with shared mapLocations helper`

## Task 4: getDocumentSymbols

**Files:**
- `src/providers/lsp-semantic-provider.ts` (edit)
- `tests/providers/lsp-semantic-provider.test.ts` (edit)

**Tests to add (write first):**
- Hierarchical `DocumentSymbol[]` response: maps name, kind (int->string), selectionRange start (1-based), range (endLine/endColumn 1-based), children recursively.
- Flat `SymbolInformation[]` response: maps name, kind, containerName, location start (1-based); endLine/endColumn from location.range.end.
- Null response: `{ symbols: [] }`.
- SymbolKind 12 (Function) -> "Function"; unknown kind -> "Symbol".

**Implementation:**
- Add `symbolKindName(kind: number): string` helper (module-level const map + fallback).
- Detect shape: `Array.isArray(result) && result.length > 0 && "selectionRange" in result[0]` -> hierarchical, else flat (SymbolInformation[]).
- Hierarchical: recursive mapper using `selectionRange.start` for position, `range` for end.
- Flat: mapper using `location.range.start` for position, `location.range.end` for end.
- No position for `prepareFile` - just `file`; note: no `line/column` in input.

**Commit:** `feat(slice-10): getDocumentSymbols with dual-shape DocumentSymbol/SymbolInformation handling`

## Task 5: getWorkspaceSymbols

**Files:**
- `src/providers/lsp-semantic-provider.ts` (edit)
- `tests/providers/lsp-semantic-provider.test.ts` (edit)

**Tests to add (write first):**
- Returns up to `limit` entries; emits truncation caveat when `rawResult.length >= limit`.
- Maps SymbolInformation: name, kind, containerName, file (fileURLToPath), 1-based line/column.
- Null response: `{ symbols: [] }`.
- Default limit 50 applied when `request.limit` undefined.

**Implementation:**
- No `prepareFile` needed (workspace-level query).
- Request: `requestWorkspaceSymbol(connection, request.query)`.
- Cap at `limit` (default 50 or `this.outputLimit` if available - use passed-in option).
- Truncation caveat: `"Results truncated at ${limit}. Narrow query for more precise results."`.

Note: workspace symbol doesn't need a file; use `ensureAnySession()` or `ensureSession(root)`. Check how the manager API works - may need to use a root path instead of a file path.

**Commit:** `feat(slice-10): getWorkspaceSymbols with limit and truncation caveat`

## Task 6: getSignatureHelp

**Files:**
- `src/providers/lsp-semantic-provider.ts` (edit)
- `tests/providers/lsp-semantic-provider.test.ts` (edit)

**Tests to add (write first):**
- Mock returns `SignatureHelp` with 1 signature, 2 params, activeSignature=0, activeParameter=1; result maps correctly.
- Mock returns `SignatureHelp` with no signatures (empty array); result has empty signatures.
- Null response: `{ signatures: [], activeSignature: 0, activeParameter: 0 }`.
- Parameter `label` as string array `[start, end]` (substring of signature label): extract label string.

**Implementation:**
- `requestSignatureHelp(connection, uri, position)` -> `SignatureHelp | null`.
- Map `SignatureHelp.signatures[]` -> `SignatureInfo[]`: label (string or ParameterInformation label), documentation (MarkupContent or string), parameters.
- Param label: `ParameterInformation.label` can be `string | [number, number]` (substring offsets into sig label) - normalize both to string.

**Commit:** `feat(slice-10): getSignatureHelp`

## Task 7: Tool Formatters (5 files)

**Files (create):**
- `src/tools/type-definition.ts`
- `src/tools/implementation.ts`
- `src/tools/document-symbols.ts`
- `src/tools/workspace-symbols.ts`
- `src/tools/signature-help.ts`

**Tests (create):**
- `tests/tools/type-definition.test.ts`
- `tests/tools/implementation.test.ts`
- `tests/tools/document-symbols.test.ts`
- `tests/tools/workspace-symbols.test.ts`
- `tests/tools/signature-help.test.ts`

**Test cases per formatter:**
- Empty result: "No X found at ..." message.
- Populated result: correct compact output format (spot-check key fields).
- Caveats rendered for workspace-symbols (truncation caveat block matches slice-9 style).

**Format guidelines (matching existing tools):**
- `type-definition.ts`: same as `definition.ts` but header says "Type definition(s)".
- `implementation.ts`: header "Implementation(s)".
- `document-symbols.ts`: tree-like indent for children; flat for SymbolInformation. Show `Name (Kind) line:col-endLine:endCol`.
- `workspace-symbols.ts`: `Name (Kind) file:line:col` per entry; truncation caveat block.
- `signature-help.ts`: active signature label; `Active parameter: name (index)`; list all params; overloads if multiple signatures.

**Commit:** `feat(slice-10): tool formatters for type_definition, implementation, document_symbols, workspace_symbols, signature_help`

## Task 8: Register Tools in server.ts

**Files:**
- `src/server.ts` (edit)
- `tests/server.test.ts` (edit)

**Tests to add (write first):**
- `type_definition` tool registered; description contains "USE THIS INSTEAD OF goto_definition" (or similar).
- `implementation` tool registered; description contains "Does NOT".
- `document_symbols` tool registered; description contains "USE THIS INSTEAD OF read".
- `workspace_symbols` tool registered; description contains "Does NOT" and "USE THIS INSTEAD OF grep".
- `signature_help` tool registered; description contains "Does NOT" and "call site".

**Input schemas to add:**
```typescript
// document_symbols - no position
export const documentSymbolsInputSchema = {
  file: z.string().describe("Absolute path to the TypeScript/JavaScript file"),
}
// workspace_symbols
export const workspaceSymbolsInputSchema = {
  query: z.string().describe("Symbol name to search for (fuzzy match)"),
  limit: z.number().int().positive().optional().describe("Maximum results to return (default 50)"),
}
// type_definition, implementation, signature_help reuse fileLocationInputSchema
```

**Descriptions (honest, "USE THIS INSTEAD OF" + "Does NOT" clauses):**
- `type_definition`: "Jump to the *type* declaration of a value. Distinct from goto_definition which jumps to the value definition... Does NOT resolve runtime type narrowing or conditional type branches."
- `implementation`: "Find concrete implementations of an interface or abstract member... USE THIS INSTEAD OF grep when searching for class extends or implements... Does NOT find dynamic mixins or Object.assign composition."
- `document_symbols`: "Get structured outline of a file (functions, classes, interfaces, variables, enums)... USE THIS INSTEAD OF reading the whole file to understand structure... Does NOT include symbols from imported modules."
- `workspace_symbols`: "Fuzzy symbol search across the entire project... USE THIS INSTEAD OF grep when finding where a symbol is defined... Does NOT search string-keyed registries or guarantee exhaustive results for very short queries."
- `signature_help`: "Get parameter names, types, and active parameter pointer at a function call site... USE THIS INSTEAD OF goto_definition when you need to know what arguments a function expects... Does NOT work outside a call argument list."

Wrap `document_symbols` and `workspace_symbols` in `withInstrumentation`.

**Commit:** `feat(slice-10): register type_definition, implementation, document_symbols, workspace_symbols, signature_help tools`

## Task 9: Acceptance + Integration

**Files:**
- `tests/integration/semantic-tools.test.ts` (edit)

**Tests to add:**
- `document_symbols` returns non-empty symbols for a fixture file with known functions.
- `workspace_symbols` for a known symbol name returns at least one result.
- `type_definition` returns a location for a typed symbol in the fixture.
- `implementation` returns locations for an interface with a known implementor in the fixture.
- `signature_help` returns a non-empty signature at a call site in the fixture.

**Verification commands:**
```sh
pnpm test
pnpm check
pnpm build
```

All must pass with 0 errors.

**Commit:** `test(slice-10): integration tests for navigation tools`

## Fixture Notes

Review `tests/fixtures/` to understand what TypeScript symbols are available for integration tests. If needed, add a small fixture file with an interface + implementor for `implementation` tests.

## Pre-existing Issues (out of scope)

- `lsp-semantic-provider.ts:331` - ReferenceKind/spread overlap (pre-existing, not introduced in slice 10).
- `/var` vs `/private/var` symlink flakiness in integration tests (pre-existing).
- `vk-slice-9-return-enrichment` worktree errors (stale worktree, not relevant).

## Commit Order

1. `feat(slice-10): LSP request helpers`
2. `feat(slice-10): provider interface types and static stubs`
3. `feat(slice-10): getTypeDefinition and getImplementation with shared mapLocations helper`
4. `feat(slice-10): getDocumentSymbols with dual-shape handling`
5. `feat(slice-10): getWorkspaceSymbols with limit and truncation caveat`
6. `feat(slice-10): getSignatureHelp`
7. `feat(slice-10): tool formatters`
8. `feat(slice-10): register tools in server.ts`
9. `test(slice-10): integration tests`
10. `docs(slice-10): spec and plan docs`
