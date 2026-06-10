# Slice 8 Reference Enrichment & Compact Output Design

Date: 2026-06-10
Status: approved for planning

## Purpose

Slice 8 makes `find_references` self-sufficient and compact. Today the tool
always marks every reference as `[read]` (isDefinition and isWriteAccess are
hardcoded false) and dumps every position at full verbosity. This forces agents
to re-read files to classify references - which was the root cause of three
missed calls in the Round 4 benchmark and doubled tool cost on large symbols
(105 raw grep hits, 88 references across 17 files).

After this slice:
- Each reference carries a `kind` tag (import, type-import, definition, call,
  jsx, export, reference) so no follow-up reads are needed to classify.
- Default output is a compact summary (N refs, M files, per-file kind
  breakdown). Full positions are opt-in via `verbose: true`.
- `output.defaultLimit` (previously dead config) caps verbose listings.
- Debug instrumentation lets us measure per-tool latency and output bytes to
  validate the improvement.

This is the dependency foundation for Slice 9 (symbol_report) and Slice 10
(rename coverage), both of which reuse reference data.

## Scope

Build:

- `ReferenceKind` string union and updated `ReferenceEntry` type in
  `semantic-provider.ts`.
- `ReferencesRequest` type (extends FileLocation, adds `verbose?: boolean`).
- `src/languages/typescript/reference-classifier.ts` - pure, block-aware lexical
  classifier for a single file's content, exported for testing.
- Updated `LspSemanticProvider.getReferences` that calls the classifier and
  sets `isDefinition` by matching the LSP definition result.
- Updated `formatReferencesResult` with compact default and verbose opt-in.
- Updated `find_references` tool description in `server.ts`.
- `output.defaultLimit` wired from config through `createServer` into the
  references tool formatter.
- `withInstrumentation` wrapper in `server.ts` for `LSP_MCP_DEBUG` logging to
  stderr.

Do not build:

- `symbol_report` combined tool (Slice 9).
- Rename pre-open coverage (Slice 10).
- Session restart or idle eviction (Slice 11).
- Pre-warming, route cache, or parallel diagnostics (Slice 12).
- tsserver native reference kind protocol (Option B) - deferred.
- Write-back or editing of any file.

## Architecture

```
find_references(file, line, column, verbose?)
  -> LspSemanticProvider.getReferences(location)
       -> ensureSession(file) -> session ready
       -> prepareFile(file)
       -> requestReferences(connection, uri, position)  [unchanged]
       -> for each referenced file:
            readFile(path) once, cache in Map<file, lines>
            classifyReferences(lines, refs for this file)
              -> scan for import/export block spans (handles multi-line)
              -> tag refs inside spans as import | type-import | export
              -> for refs outside: check context for jsx | call
              -> fall back to reference
       -> isDefinition: match ref position against requestDefinition result
       -> return enriched ReferenceEntry[]
  -> formatReferencesResult(location, result, { verbose, limit })
       -> compact (default): "N refs across M files\n  file: 4 (1 def, 2 call, 1 import)\n  ..."
       -> verbose: per-file position list with kind tag, truncated at limit
```

The classifier is a **pure function** (takes file content string, list of
positions) with no I/O. File reads happen in the provider, one per unique file,
cached in a `Map` scoped to the single `getReferences` call.

## Reference Kind Classification - Option A (lexical, block-aware)

### Why block-aware scanning is required

grep and line-oriented classifiers miss multi-line imports:

```ts
import {
  ButtonBaseProps,   // <- this reference is NOT on the import line
} from "./Button";
```

The classifier scans for import/export statement spans first (start-line to
matching closing brace/semicolon), then tags all references whose line falls
inside a span. This is the exact pattern that caused the ButtonGroup miss.

### Classification rules (applied in priority order)

1. **definition** - ref position matches the LSP `goto_definition` result for
   the queried symbol (only one per symbol per file, normally).
2. **import** - ref falls inside an `import { ... }` block (non-type).
3. **type-import** - ref falls inside an `import type { ... }` block or an
   `import { type Foo }` inline-type specifier.
4. **export** - ref falls inside an `export { ... }` or `export * from` span.
5. **jsx** - ref is immediately followed by a JSX usage pattern: ref token is
   preceded by `<` or is the tag name in a JSX expression.
6. **call** - ref token is immediately followed by `(` on the same line (after
   optional generic params `<...>`).
7. **reference** - fallback for anything that does not match the above.

The classifier operates on the raw lines of the file. It does not parse a full
AST; it uses a focused block-boundary scan (brace matching limited to the
import/export statement) and single-line context checks for jsx/call.

### Limitations (documented, not fixed here)

- Destructured re-exports (`export { Foo as Bar }`) are tagged `export` not
  `reference` - correct.
- Dynamic imports (`import(...)`) are not scanned; fall back to `reference`.
- Tagged template literal calls (`Foo\`...\``) are not detected as `call`.
- Type-only inline specifier (`import { type Foo, Bar }`) - `type Foo` tagged
  `type-import`, `Bar` tagged `import`. Correct.

## Updated Types

### `src/providers/semantic-provider.ts`

```ts
export type ReferenceKind =
  | "definition"
  | "import"
  | "type-import"
  | "export"
  | "jsx"
  | "call"
  | "reference";

export interface ReferenceEntry {
  file: string;
  line: number;
  column: number;
  isDefinition: boolean;
  kind: ReferenceKind;
}

export interface ReferencesRequest extends FileLocation {
  verbose?: boolean;
}

export interface ReferencesResult {
  references: ReferenceEntry[];
}
```

`isWriteAccess` is removed. It was always `false` and `kind` supersedes it.

### `SemanticProvider` interface

`getReferences` signature changes from:

```ts
getReferences(location: FileLocation): Promise<ReferencesResult>;
```

to:

```ts
getReferences(request: ReferencesRequest): Promise<ReferencesResult>;
```

(FileLocation fields are still `file`, `line`, `column`; `verbose` is additive.)

## Tool Input

```ts
{
  file: string;      // absolute path
  line: number;      // 1-based
  column: number;    // 1-based
  verbose?: boolean; // false (default): compact summary; true: full positions
}
```

## Tool Output

### Compact (default)

```
References for symbol at /src/Button.tsx:12:14

  17 files, 88 references
  /src/Button.tsx:           5  (1 def, 3 call, 1 import)
  /src/ButtonGroup.tsx:      4  (2 import, 2 call)
  /src/index.ts:             1  (1 export)
  ... and 14 more files
```

### Verbose (`verbose: true`)

```
References (88 total) for symbol at /src/Button.tsx:12:14

  /src/Button.tsx:
    L12:14  [definition]
    L45:3   [call]
    L67:12  [call]
    L80:3   [import]
    L90:5   [call]
  /src/ButtonGroup.tsx:
    L2:10   [import]
    L3:12   [type-import]
    ... and 82 more
```

Truncation line (`... and X more`) appears when positions exceed
`output.defaultLimit` (50 by default).

No raw JSON, LSP payloads, or `isWriteAccess` field in any output.

## Instrumentation

`withInstrumentation(toolName, handler)` wraps the async tool handler. When
`process.env.LSP_MCP_DEBUG` is set (any truthy value), it writes one line to
**stderr** per call:

```
[lsp-mcp] find_references 312ms 1843 bytes
```

Format: `[lsp-mcp] <tool> <durationMs>ms <outputBytes> bytes`

Stdout is reserved for the MCP protocol. Instrumentation must never write to
stdout.

## Config wiring

`createServer` gains an optional second parameter:

```ts
export interface ServerOptions {
  outputLimit?: number;
}

export function createServer(
  dependencies: ServerDependencies = {},
  options: ServerOptions = {},
): McpServer
```

`createDefaultProvider` passes `config.output.defaultLimit` to
`startStdioServer`, which calls `createServer(..., { outputLimit:
config.output.defaultLimit })`. The limit flows into `createReferencesTool`.

## Testing

All new logic is written test-first (failing test -> implementation ->
passing).

Unit tests:

- `tests/languages/typescript/reference-classifier.test.ts` (new):
  - Multi-line import span: ref on second line tagged `import`.
  - `import type` block: tagged `type-import`.
  - Inline type specifier `import { type Foo, Bar }`: `type-import` and
    `import` respectively.
  - Re-export block: tagged `export`.
  - JSX usage: tagged `jsx`.
  - Call site (trailing `(`): tagged `call`.
  - Definition position match: tagged `definition`.
  - Unknown / fallback: tagged `reference`.

- `tests/tools/references.test.ts` (update):
  - Compact default output format with kind breakdown.
  - Verbose output with kind tags per position.
  - Truncation at defaultLimit.
  - `verbose: true` bypasses summary.
  - No `isWriteAccess` in output.

- `tests/providers/lsp-semantic-provider.test.ts` (update):
  - `getReferences` returns `kind` on each entry.
  - `isDefinition` is `true` for the definition entry and `false` for others.

- `tests/server.test.ts` (update):
  - `withInstrumentation` does not emit when `LSP_MCP_DEBUG` unset.
  - `withInstrumentation` writes to stderr (not stdout) when set.
  - `outputLimit` from `ServerOptions` reaches the references formatter.

Integration tests:

- `tests/integration/semantic-tools.test.ts` (update):
  - `getReferences` on `add` in `utils.ts` returns entries including at least
    one `definition` and at least one `call` or `import`.
  - Compact output contains the file name and kind summary.
  - Verbose output contains position lines.

Acceptance:

```sh
pnpm test
pnpm check
pnpm build
```

## Risks

- **Heuristic misclassification** - mitigated by `reference` fallback; no
  reference is lost, only tagged conservatively. Documented limitations above.
- **File reads per getReferences call** - bounded to one read per unique
  referenced file, cached in a Map. Not a regression: the agent currently reads
  those same files itself to classify.
- **isWriteAccess removal** - breaking change accepted per "change freely"
  decision. No caller in the codebase reads it (was always false).
- **Output shape change** - compact default is a breaking format change.
  Agents relying on the old line-per-position format must use `verbose: true`.

## Post-slice validation

After implementation, re-run the Button obstacle course (once the E1 harness
is located or recreated). Target: lsp-new stops stacking grep for Step 3 and
Step 6 (multi-line import classification); cache-write per turn decreases.

## Self-Review

- Placeholder scan: no placeholders remain.
- Scope check: only find_references and instrumentation; no other tools
  modified.
- Ambiguity check: classifier limitations documented; `reference` fallback
  explicit.
- Consistency check: compact/verbose output follows the plain-text convention
  of prior slices.
