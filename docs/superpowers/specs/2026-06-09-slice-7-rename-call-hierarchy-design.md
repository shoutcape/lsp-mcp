# Slice 7 Rename & Call Hierarchy Design

Date: 2026-06-09
Status: approved for planning

## Purpose

Slice 7 adds rename preview and call hierarchy navigation tools on top of the
semantic tool infrastructure from Slice 5. These features help agents perform
scope-aware refactoring (rename identifies all locations that must change,
avoiding grep false positives) and trace directed call relationships (who calls
this function, what does it call).

## Scope

Build:

- Public MCP tools: `rename` and `call_hierarchy`.
- Provider contract methods for rename and call hierarchy.
- LSP request helpers for `textDocument/prepareRename`, `textDocument/rename`,
  `textDocument/prepareCallHierarchy`, `callHierarchy/incomingCalls`, and
  `callHierarchy/outgoingCalls`.
- WorkspaceEdit to flat RenameLocation conversion.
- SymbolKind numeric-to-string mapping for human-readable output.
- Plain-text result formatting for both tools.
- Unit tests for formatters, request wrappers, and provider methods.
- Integration tests with real TypeScript LSP.
- Updated supportedTools list and capabilities output.

Do not build:

- Actual file editing or write-back of rename changes.
- Recursive or multi-level call hierarchy traversal.
- Type hierarchy.
- Workspace-wide symbol search.
- Call hierarchy filtering by file or depth.
- Rename conflict detection or validation beyond what prepareRename provides.

## Architecture

Both tools follow the same 5-layer pattern as existing semantic tools:

```
MCP client
  -> lsp-mcp server (input validation, tool registration)
    -> tool handler (format output)
      -> SemanticProvider
        -> LspSemanticProvider (session, file sync, LSP request, result conversion)
          -> semantic-requests (raw LSP protocol calls)
```

### Rename Flow

```
rename(file, line, column, newName)
  -> prepareRename(uri, position) -> validate, get placeholder/display name
  -> if null: return canRename=false with error message
  -> rename(uri, position, newName) -> WorkspaceEdit
  -> convert WorkspaceEdit.changes to flat RenameLocation[] (1-based coords)
  -> format text output with location list and apply instructions
```

### Call Hierarchy Flow

```
call_hierarchy(file, line, column, direction)
  -> prepareCallHierarchy(uri, position) -> CallHierarchyItem[]
  -> if empty: return item=null
  -> use items[0] as the target item
  -> if direction includes "incoming": incomingCalls(item) -> CallHierarchyIncomingCall[]
  -> if direction includes "outgoing": outgoingCalls(item) -> CallHierarchyOutgoingCall[]
  -> convert LSP SymbolKind (numeric) to string names
  -> convert 0-based LSP positions to 1-based output coordinates
  -> format text with directional arrows
```

## Tool Surface

Updated public tool list after this slice:

```
health
capabilities
goto_definition
find_references
hover
diagnostics
rename
call_hierarchy
```

## Provider Contract

New types added to `src/providers/semantic-provider.ts`:

```ts
export interface RenameLocation {
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  prefixText?: string;
  suffixText?: string;
}

export interface RenameResult {
  canRename: boolean;
  displayName?: string;
  reason?: string;
  locations: RenameLocation[];
}

export interface RenameRequest extends FileLocation {
  newName: string;
}

export interface CallHierarchyItemInfo {
  name: string;
  kind: string;
  file: string;
  line: number;
  column: number;
  containerName?: string;
}

export interface IncomingCallInfo {
  from: CallHierarchyItemInfo;
}

export interface OutgoingCallInfo {
  to: CallHierarchyItemInfo;
}

export interface CallHierarchyResult {
  item: CallHierarchyItemInfo | null;
  incoming?: IncomingCallInfo[];
  outgoing?: OutgoingCallInfo[];
}

export interface CallHierarchyRequest extends FileLocation {
  direction: "incoming" | "outgoing" | "both";
}
```

New methods on `SemanticProvider`:

```ts
getRename(request: RenameRequest): Promise<RenameResult>;
getCallHierarchy(request: CallHierarchyRequest): Promise<CallHierarchyResult>;
```

## Tool Inputs

Rename:

```ts
{
  file: string;      // absolute path
  line: number;      // 1-based
  column: number;    // 1-based
  newName: string;   // desired replacement name
}
```

Call hierarchy:

```ts
{
  file: string;      // absolute path
  line: number;      // 1-based
  column: number;    // 1-based
  direction: "incoming" | "outgoing" | "both";
}
```

## Tool Output

### Rename - success

```
Rename "add" -> "sum"
3 location(s) across 2 file(s):

  /workspace/src/utils.ts:
    L2:17-L2:20
  /workspace/src/index.ts:
    L1:10-L1:13
    L3:16-L3:19

Apply: Replace the old name with "sum" at each location above.
```

### Rename - cannot rename

```
Cannot rename symbol at /workspace/src/index.ts:1:1: You cannot rename this element.
```

### Call hierarchy - incoming

```
Call hierarchy for: add [function] at /workspace/src/utils.ts:2

  Incoming calls (1):
    <- main (in <module>) [function] at /workspace/src/index.ts:6
```

### Call hierarchy - outgoing

```
Call hierarchy for: main [function] at /workspace/src/index.ts:6

  Outgoing calls (2):
    -> add [function] at /workspace/src/utils.ts:2
    -> createGreeting [function] at /workspace/src/utils.ts:12
```

### Call hierarchy - no item

```
No call hierarchy item at /workspace/src/index.ts:1:1
```

No raw JSON or LSP payloads in any output.

## LSP Requests

New requests sent in this slice:

```
textDocument/prepareRename
textDocument/rename
textDocument/prepareCallHierarchy
callHierarchy/incomingCalls
callHierarchy/outgoingCalls
```

`textDocument/prepareRename` returns `Range | { range, placeholder } | null`.
All three shapes must be handled. Null means cannot rename.

`textDocument/rename` returns `WorkspaceEdit | null`. The provider reads
`WorkspaceEdit.changes` (URI -> TextEdit[]) and converts each TextEdit to a
RenameLocation. The `documentChanges` variant is not required since TypeScript
language server uses `changes`.

`textDocument/prepareCallHierarchy` returns `CallHierarchyItem[] | null`.
The first item is used for subsequent incoming/outgoing queries.

`callHierarchy/incomingCalls` and `callHierarchy/outgoingCalls` each receive
a `CallHierarchyItem` as the `item` parameter and return their respective
arrays. The full item object including the opaque `data` field must be
forwarded as-is.

## SymbolKind Mapping

LSP SymbolKind is a number (1-26). The output uses human-readable names:

```ts
const SYMBOL_KIND_NAMES: Record<number, string> = {
  1: "file", 2: "module", 3: "namespace", 4: "package",
  5: "class", 6: "method", 7: "property", 8: "field",
  9: "constructor", 10: "enum", 11: "interface", 12: "function",
  13: "variable", 14: "constant", 15: "string", 16: "number",
  17: "boolean", 18: "array", 19: "object", 20: "key",
  21: "null", 22: "enum-member", 23: "struct", 24: "event",
  25: "operator", 26: "type-parameter",
};
```

Unknown values fall back to `"unknown"`.

## Testing

Unit tests:

- `formatRenameResult` - multi-file success, prefix/suffix context, cannot-rename.
- `formatCallHierarchyResult` - incoming, outgoing, both directions, empty lists, no item.
- New LSP request wrappers send correct methods and params.
- `LspSemanticProvider.getRename` converts WorkspaceEdit to flat RenameLocation[].
- `LspSemanticProvider.getCallHierarchy` converts LSP items and SymbolKind.
- `supportedTools` includes `rename` and `call_hierarchy`.
- MCP server registers all 8 tools.

Integration tests (real TypeScript LSP):

- Rename `add` in utils.ts returns locations in both utils.ts and index.ts.
- Call hierarchy incoming on `add` returns callers from index.ts.
- Call hierarchy outgoing on `main` returns `add` and `createGreeting` callees.

Acceptance:

```sh
pnpm test
pnpm check
pnpm build
```

## Risks

- `prepareRename` returns three possible shapes. All must be normalized.
- Call hierarchy item's opaque `data` field must be forwarded intact or
  `incomingCalls`/`outgoingCalls` may fail.
- `WorkspaceEdit` may use `documentChanges` on future server versions. Handle
  `changes` only for now; add `documentChanges` support if needed.
- SymbolKind values outside 1-26 should not crash the formatter.

## Self-Review

- Placeholder scan: no placeholders remain.
- Scope check: focused on two new tools only, no unrelated changes.
- Ambiguity check: rename is preview-only, not write-back.
- Consistency check: output format matches compact plain-text convention.
