# Slice 10: Phase 2 Navigation Tools - Design Spec

Date: 2026-06-11
Status: approved for implementation

## Purpose

Slice 10 completes the Phase 2 navigation tool surface defined in the original
design spec. After slices 1-9 the server exposes 9 tools covering health,
capabilities, goto_definition, find_references, hover, diagnostics, rename, and
call_hierarchy. Five tools remain unimplemented:

- `type_definition` - jump to the type declaration of a value (distinct from goto_definition)
- `implementation` - find concrete implementations of an interface or abstract member
- `document_symbols` - structured outline (functions, classes, vars) for one file
- `workspace_symbols` - fuzzy symbol search across the whole project
- `signature_help` - parameter names, types, and active-param pointer at a call site

These are all single-LSP-method wrappers. The implementation follows the
pattern established by `goto_definition` and `call_hierarchy`: LSP request
helper -> provider method -> tool formatter -> registered in server.ts.

## Non-Goals (unchanged from master spec)

- No write-back, no file edits.
- No new language presets.
- No raw LSP payload exposure.
- No new session lifecycle logic.
- No MCP resources.

## New Tools

### `type_definition`

**LSP method:** `textDocument/typeDefinition`

**Agent value:** Distinguishes "where is this value defined" (goto_definition)
from "where is its *type* declared". Essential for navigating generics,
utilities (`ReturnType<F>`, `Awaited<T>`), and type aliases without reading
source manually.

**Input:** `{ file, line, column }` (same as goto_definition)

**Output:** Same location list format as goto_definition.

**Does NOT:** resolve runtime type narrowing (union narrowing to a specific
branch); reflects the static declared type.

### `implementation`

**LSP method:** `textDocument/implementation`

**Agent value:** Replaces multi-step grep-for-class-extends patterns.
"Which classes implement this interface?" or "what are the concrete bodies of
this abstract method?" in one call.

**Input:** `{ file, line, column }`

**Output:** Location list.

**Does NOT:** find implementations in unindexed or non-TypeScript files; does
not find dynamic mixins or Object.assign-based composition patterns.

### `document_symbols`

**LSP method:** `textDocument/documentSymbol`

**Agent value:** Produces a structured outline of one file (functions,
classes, interfaces, variables, enums, namespaces) without reading the whole
file. Agents use this to understand file structure before targeted hover/definition
calls - avoids a full file read for context.

**Input:** `{ file }` (no position needed)

**LSP response shape:** The method returns EITHER:
- `DocumentSymbol[]` (hierarchical) - symbols have `children`, `kind`, `range`, `selectionRange`
- `SymbolInformation[]` (flat) - symbols have `containerName`, `kind`, `location`

The provider maps both shapes to a uniform flat list (`DocumentSymbolEntry[]`)
with optional `children` references. The formatter renders a tree-like indent
for hierarchical results and a flat list for flat results.

**Symbol kind:** Map the LSP `SymbolKind` enum integers to readable strings
(e.g. 1=File, 5=Class, 6=Method, 12=Function, 13=Variable, ...).

**Does NOT:** include symbols from imported modules; limited to the symbols
the language server indexes for the given file.

### `workspace_symbols`

**LSP method:** `workspace/symbol`

**Agent value:** Fuzzy symbol search across the entire project. Replaces
grep-for-function-name when the agent needs to find "where is X defined"
across multiple files. Faster and scope-aware vs text search.

**Input:** `{ query: string, limit?: number }` (limit defaults to 50)

**Output:** List of `{ name, kind, file, line, column, containerName? }` entries.
Truncation caveat when result count hits limit.

**Does NOT:** search symbols in node_modules (unless tsconfig includes them);
fuzzy matching quality depends on the language server implementation; does
not guarantee exhaustive results for very short queries.

### `signature_help`

**LSP method:** `textDocument/signatureHelp`

**Agent value:** At a function call site, returns the parameter list with
names and types, which parameter is active (cursor position), and any
JSDoc for the signature. Agents use this to understand what arguments a
function expects at point of use without reading the function definition.

**Input:** `{ file, line, column }`

**Output:** Active signature label, list of parameters with labels/docs,
active parameter index, and all available overload signatures.

**Does NOT:** work outside a call site (returns "no signature" when cursor
is not inside a function argument list); does not resolve overload selection
at runtime.

## Architecture

### `src/lsp/semantic-requests.ts`

Add five helpers following the existing pattern:

```typescript
requestTypeDefinition(connection, uri, position)  // TypeDefinitionRequest
requestImplementation(connection, uri, position)  // ImplementationRequest
requestDocumentSymbol(connection, uri)            // DocumentSymbolRequest
requestWorkspaceSymbol(connection, query)         // WorkspaceSymbolRequest
requestSignatureHelp(connection, uri, position)   // SignatureHelpRequest
```

All return `Promise<Result | null>` where Result is the typed LSP protocol type.

### `src/providers/semantic-provider.ts`

New types:

```typescript
// Reuses DefinitionEntry for type_definition and implementation
interface TypeDefinitionResult { locations: DefinitionEntry[] }
interface ImplementationResult { locations: DefinitionEntry[] }

type SymbolKindName = string  // e.g. "Function", "Class", "Variable"

interface DocumentSymbolEntry {
  name: string
  kind: SymbolKindName
  line: number
  column: number
  endLine: number
  endColumn: number
  containerName?: string    // for flat SymbolInformation shape
  children?: DocumentSymbolEntry[]  // for hierarchical DocumentSymbol shape
}
interface DocumentSymbolsResult { symbols: DocumentSymbolEntry[] }

interface WorkspaceSymbolEntry {
  name: string
  kind: SymbolKindName
  file: string
  line: number
  column: number
  containerName?: string
}
interface WorkspaceSymbolsRequest {
  query: string
  limit?: number
}
interface WorkspaceSymbolsResult {
  symbols: WorkspaceSymbolEntry[]
  caveats?: string[]
}

interface SignatureParameter {
  label: string
  documentation?: string
}
interface SignatureInfo {
  label: string
  documentation?: string
  parameters: SignatureParameter[]
}
interface SignatureHelpResult {
  signatures: SignatureInfo[]
  activeSignature: number
  activeParameter: number
}
```

New methods on `SemanticProvider`:

```typescript
getTypeDefinition(location: FileLocation): Promise<TypeDefinitionResult>
getImplementation(location: FileLocation): Promise<ImplementationResult>
getDocumentSymbols(file: string): Promise<DocumentSymbolsResult>
getWorkspaceSymbols(request: WorkspaceSymbolsRequest): Promise<WorkspaceSymbolsResult>
getSignatureHelp(location: FileLocation): Promise<SignatureHelpResult>
```

### `src/providers/lsp-semantic-provider.ts`

Extract shared `mapLocations(result)` helper used by `getDefinition`,
`getTypeDefinition`, and `getImplementation`. This removes the three
copies of the `AnyLoc` mapping.

Add five methods following `getDefinition` pattern:
- ensureSession -> prepareFile -> getConnection -> request -> map to 1-based

`getDocumentSymbols` detects shape by `"children" in symbols[0]` (DocumentSymbol)
vs absence (SymbolInformation) and maps accordingly.

`getWorkspaceSymbols` applies `limit` cap after receiving results and sets
truncation caveat if `rawResult.length === limit`.

### `src/providers/static-semantic-provider.ts`

Add five stub methods returning empty results so the interface remains satisfiable
in tests that use `StaticSemanticProvider`.

### `src/tools/` (5 new files)

Each file exports:
- `format*Result(input, result): string` - pure formatter, testable without provider
- `create*Tool(provider): ToolHandler` - wires input to provider and textResult

Output follows slice-8/9 conventions: compact, line-oriented, human+agent readable.
Caveats block rendered for workspace_symbols truncation caveat.

### `src/server.ts`

New input schemas:
- `workspaceSymbolsInputSchema`: `{ query: string, limit?: number }`
- Others reuse `fileLocationInputSchema` or `{ file: string }`

Five `registerTool` blocks with descriptions following the established pattern:
- Lead with agent use case
- "USE THIS INSTEAD OF" guidance
- "Does NOT" honesty clause

`workspace_symbols` and `document_symbols` wrapped in `withInstrumentation`.

## SymbolKind Mapping

LSP SymbolKind values (integers) to readable names used in output:

| Value | Name         | Value | Name          |
|-------|--------------|-------|---------------|
| 1     | File         | 14    | Boolean       |
| 2     | Module       | 15    | Array         |
| 3     | Namespace    | 16    | Object        |
| 4     | Package      | 17    | Key           |
| 5     | Class        | 18    | Null          |
| 6     | Method       | 19    | EnumMember    |
| 7     | Property     | 20    | Struct        |
| 8     | Field        | 21    | Event         |
| 9     | Constructor  | 22    | Operator      |
| 10    | Enum         | 23    | TypeParameter |
| 11    | Interface    |       |               |
| 12    | Function     |       |               |
| 13    | Variable     |       |               |

Unknown values fall back to `"Symbol"`.

## Output Examples

### type_definition / implementation

```
Type definition(s) for symbol at src/utils.ts:10:5:

  src/types.ts:3:1
```

```
No type definition found at src/utils.ts:10:5
```

### document_symbols

```
Symbols in src/components/Button.tsx:

  Button (Function) 5:1-42:1
    props (Variable) 6:3-6:20
  ButtonProps (Interface) 1:1-4:1
```

```
No symbols found in src/empty.ts
```

### workspace_symbols

```
Workspace symbols for "useAuth":

  useAuth (Function) src/hooks/auth.ts:12:1
  useAuthContext (Function) src/context/auth.ts:5:1

Result: 2 symbols
```

With truncation:
```
Result: 50 symbols
Limit: 50
Truncated: true
Suggestion: narrow query or increase limit.
```

### signature_help

```
Signature help at src/App.tsx:20:18:

  createServer(dependencies?: ServerDependencies, options?: ServerOptions): McpServer
  Active parameter: options (1)

  Parameters:
    [0] dependencies?: ServerDependencies
    [1] options?: ServerOptions
```

```
No signature help at src/App.tsx:20:3 (cursor not inside a call argument list)
```

## Caveats

- `workspace_symbols`: truncation when result count hits limit.
- `implementation`: note that only statically-resolvable implementors are found;
  dynamic patterns (Object.assign composition, mixins) are excluded.
- `document_symbols`: depends on language server file indexing; deeply nested
  symbols may not appear in older server versions.

## Testing Strategy

Unit tests (test-first):
- LSP request helpers: mock connection, assert correct method + params.
- Provider types: compile-time (TypeScript satisfies check).
- StaticSemanticProvider stubs: return empty without throwing.
- LspSemanticProvider: mock connection per method; test null -> empty, shape detection for document_symbols, limit + caveat for workspace_symbols.
- Tool formatters: empty + populated + caveats (workspace_symbols).
- server.ts: 5 new tool registrations present; descriptions contain honesty clauses.

Integration tests:
- Extend `tests/integration/semantic-tools.test.ts` to call all 5 new tools
  against the real typescript-language-server fixture. At minimum:
  - `document_symbols` returns symbols for a fixture file.
  - `workspace_symbols` returns at least one hit for a known symbol name.
  - `type_definition` returns a location for a typed symbol.
  - `implementation` returns locations for an interface with a known implementor.
  - `signature_help` returns a non-empty signature at a known call site.

## Acceptance

```sh
pnpm test
pnpm check
pnpm build
```

All 5 tools registered, correct output against TS fixture, honest descriptions/caveats.
