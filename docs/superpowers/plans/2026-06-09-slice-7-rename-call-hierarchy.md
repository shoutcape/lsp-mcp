# Slice 7 Rename & Call Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `rename` and `call_hierarchy` MCP tools that use LSP to find rename locations and trace caller/callee relationships.

**Architecture:** Both tools follow the existing 5-layer pattern (types -> LSP requests -> provider -> tool formatter -> server registration). Rename uses `prepareRename` + `rename` (two LSP calls) to validate the symbol then return a flat location list from the WorkspaceEdit. Call hierarchy uses a 2-step LSP protocol: prepare item, then query incoming/outgoing with that item forwarded intact.

**Tech Stack:** TypeScript ESM, vscode-languageserver-protocol 3.17.5, McpServer SDK, Zod v4, Vitest.

---

## File Structure

- Modify: `src/providers/semantic-provider.ts` - add 9 new interfaces and 2 methods on SemanticProvider
- Modify: `src/providers/static-semantic-provider.ts` - add 2 stub implementations
- Modify: `src/providers/lsp-semantic-provider.ts` - implement getRename, getCallHierarchy, update supportedTools
- Modify: `src/lsp/semantic-requests.ts` - add 5 new LSP request wrappers
- Create: `src/tools/rename.ts` - formatter + handler factory
- Create: `src/tools/call-hierarchy.ts` - formatter + handler factory
- Modify: `src/server.ts` - register 2 new tools with schemas, add 2 imports
- Create: `tests/tools/rename.test.ts` - unit tests for rename formatter
- Create: `tests/tools/call-hierarchy.test.ts` - unit tests for call hierarchy formatter
- Modify: `tests/lsp/semantic-requests.test.ts` - add 5 request wrapper tests
- Modify: `tests/providers/lsp-semantic-provider.test.ts` - add 2 provider tests
- Modify: `tests/server.test.ts` - assert 8 tools registered
- Modify: `tests/integration/semantic-tools.test.ts` - add 3 integration tests

---

## Task 1: Provider Contract

**Files:**
- Modify: `src/providers/semantic-provider.ts`
- Modify: `src/providers/static-semantic-provider.ts`

- [ ] **Step 1: Add types to semantic-provider.ts**

Append after the `DiagnosticsResult` interface:

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

- [ ] **Step 2: Add methods to SemanticProvider interface**

Append to the `SemanticProvider` interface body:

```ts
getRename(request: RenameRequest): Promise<RenameResult>;
getCallHierarchy(request: CallHierarchyRequest): Promise<CallHierarchyResult>;
```

- [ ] **Step 3: Add stub implementations to StaticSemanticProvider**

```ts
async getRename(): Promise<RenameResult> {
  return { canRename: false, reason: "Not implemented.", locations: [] };
}

async getCallHierarchy(): Promise<CallHierarchyResult> {
  return { item: null };
}
```

- [ ] **Step 4: Run existing tests to confirm they still pass**

```sh
pnpm test tests/providers/ tests/server.test.ts
```

Expected: all pass (stubs satisfy new interface methods).

- [ ] **Step 5: Commit**

```sh
git add src/providers/semantic-provider.ts src/providers/static-semantic-provider.ts
git commit -m "feat: add rename and call hierarchy types to provider contract"
```

---

## Task 2: LSP Request Wrappers

**Files:**
- Modify: `src/lsp/semantic-requests.ts`
- Modify: `tests/lsp/semantic-requests.test.ts`

- [ ] **Step 1: Write failing tests for the 5 new request wrappers**

Add to `tests/lsp/semantic-requests.test.ts`:

```ts
describe("requestPrepareRename", () => {
  it("sends textDocument/prepareRename", async () => {
    const conn = mockConnection({ start: { line: 1, character: 4 }, end: { line: 1, character: 7 } });
    await requestPrepareRename(conn, "file:///a.ts", { line: 1, character: 4 });
    expect(conn.sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: "textDocument/prepareRename" }),
      { textDocument: { uri: "file:///a.ts" }, position: { line: 1, character: 4 } },
    );
  });
});

describe("requestRename", () => {
  it("sends textDocument/rename with newName", async () => {
    const conn = mockConnection({ changes: {} });
    await requestRename(conn, "file:///a.ts", { line: 1, character: 4 }, "newName");
    expect(conn.sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: "textDocument/rename" }),
      { textDocument: { uri: "file:///a.ts" }, position: { line: 1, character: 4 }, newName: "newName" },
    );
  });
});

describe("requestPrepareCallHierarchy", () => {
  it("sends textDocument/prepareCallHierarchy", async () => {
    const conn = mockConnection([]);
    await requestPrepareCallHierarchy(conn, "file:///a.ts", { line: 5, character: 10 });
    expect(conn.sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: "textDocument/prepareCallHierarchy" }),
      { textDocument: { uri: "file:///a.ts" }, position: { line: 5, character: 10 } },
    );
  });
});

describe("requestCallHierarchyIncoming", () => {
  it("sends callHierarchy/incomingCalls with item", async () => {
    const item = { name: "add", kind: 12, uri: "file:///a.ts", range: { start: { line: 1, character: 0 }, end: { line: 3, character: 1 } }, selectionRange: { start: { line: 1, character: 9 }, end: { line: 1, character: 12 } } };
    const conn = mockConnection([]);
    await requestCallHierarchyIncoming(conn, item as any);
    expect(conn.sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: "callHierarchy/incomingCalls" }),
      { item },
    );
  });
});

describe("requestCallHierarchyOutgoing", () => {
  it("sends callHierarchy/outgoingCalls with item", async () => {
    const item = { name: "main", kind: 12, uri: "file:///a.ts", range: { start: { line: 5, character: 0 }, end: { line: 7, character: 1 } }, selectionRange: { start: { line: 5, character: 9 }, end: { line: 5, character: 13 } } };
    const conn = mockConnection([]);
    await requestCallHierarchyOutgoing(conn, item as any);
    expect(conn.sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: "callHierarchy/outgoingCalls" }),
      { item },
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

```sh
pnpm test tests/lsp/semantic-requests.test.ts
```

Expected: import errors for missing functions.

- [ ] **Step 3: Implement the 5 request wrappers in semantic-requests.ts**

```ts
import {
  type CallHierarchyItem,
  type CallHierarchyIncomingCall,
  type CallHierarchyOutgoingCall,
  CallHierarchyIncomingCallsRequest,
  CallHierarchyOutgoingCallsRequest,
  CallHierarchyPrepareRequest,
  type Definition,
  DefinitionRequest,
  type Hover,
  HoverRequest,
  type Location,
  type Position,
  PrepareRenameRequest,
  ReferencesRequest,
  RenameRequest,
  type WorkspaceEdit,
} from "vscode-languageserver-protocol";
```

Add functions:

```ts
export async function requestPrepareRename(
  connection: LspConnection,
  uri: string,
  position: Position,
): Promise<unknown> {
  return connection.sendRequest(PrepareRenameRequest.type, {
    textDocument: { uri },
    position,
  });
}

export async function requestRename(
  connection: LspConnection,
  uri: string,
  position: Position,
  newName: string,
): Promise<WorkspaceEdit | null> {
  return connection.sendRequest(RenameRequest.type, {
    textDocument: { uri },
    position,
    newName,
  }) as Promise<WorkspaceEdit | null>;
}

export async function requestPrepareCallHierarchy(
  connection: LspConnection,
  uri: string,
  position: Position,
): Promise<CallHierarchyItem[] | null> {
  return connection.sendRequest(CallHierarchyPrepareRequest.type, {
    textDocument: { uri },
    position,
  }) as Promise<CallHierarchyItem[] | null>;
}

export async function requestCallHierarchyIncoming(
  connection: LspConnection,
  item: CallHierarchyItem,
): Promise<CallHierarchyIncomingCall[] | null> {
  return connection.sendRequest(CallHierarchyIncomingCallsRequest.type, {
    item,
  }) as Promise<CallHierarchyIncomingCall[] | null>;
}

export async function requestCallHierarchyOutgoing(
  connection: LspConnection,
  item: CallHierarchyItem,
): Promise<CallHierarchyOutgoingCall[] | null> {
  return connection.sendRequest(CallHierarchyOutgoingCallsRequest.type, {
    item,
  }) as Promise<CallHierarchyOutgoingCall[] | null>;
}
```

- [ ] **Step 4: Run tests to verify pass**

```sh
pnpm test tests/lsp/semantic-requests.test.ts
```

Expected: all 8 tests pass (3 existing + 5 new).

- [ ] **Step 5: Commit**

```sh
git add src/lsp/semantic-requests.ts tests/lsp/semantic-requests.test.ts
git commit -m "feat: add rename and call hierarchy LSP request wrappers"
```

---

## Task 3: Tool Formatters

**Files:**
- Create: `src/tools/rename.ts`
- Create: `src/tools/call-hierarchy.ts`
- Create: `tests/tools/rename.test.ts`
- Create: `tests/tools/call-hierarchy.test.ts`

- [ ] **Step 1: Write failing rename formatter tests**

Create `tests/tools/rename.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type {
  RenameRequest,
  RenameResult,
} from "../../src/providers/semantic-provider.js";
import { formatRenameResult } from "../../src/tools/rename.js";

describe("formatRenameResult", () => {
  const request: RenameRequest = {
    file: "/src/utils.ts",
    line: 2,
    column: 17,
    newName: "sum",
  };

  it("formats multi-file success result", () => {
    const result: RenameResult = {
      canRename: true,
      displayName: "add",
      locations: [
        { file: "/src/utils.ts", line: 2, column: 17, endLine: 2, endColumn: 20 },
        { file: "/src/index.ts", line: 1, column: 10, endLine: 1, endColumn: 13 },
        { file: "/src/index.ts", line: 3, column: 16, endLine: 3, endColumn: 19 },
      ],
    };
    const text = formatRenameResult(request, result);
    expect(text).toContain('Rename "add" -> "sum"');
    expect(text).toContain("3 location(s) across 2 file(s)");
    expect(text).toContain("/src/utils.ts:");
    expect(text).toContain("L2:17-L2:20");
    expect(text).toContain("/src/index.ts:");
    expect(text).toContain("L1:10-L1:13");
    expect(text).toContain("L3:16-L3:19");
    expect(text).toContain('Apply: Replace the old name with "sum"');
  });

  it("formats location with prefix and suffix context", () => {
    const result: RenameResult = {
      canRename: true,
      displayName: "add",
      locations: [
        {
          file: "/src/a.ts",
          line: 5,
          column: 3,
          endLine: 5,
          endColumn: 6,
          prefixText: "obj.",
          suffixText: "(",
        },
      ],
    };
    const text = formatRenameResult(request, result);
    expect(text).toContain('prefix: "obj."');
    expect(text).toContain('suffix: "("');
  });

  it("reports cannot rename with reason", () => {
    const result: RenameResult = {
      canRename: false,
      reason: "You cannot rename this element.",
      locations: [],
    };
    const text = formatRenameResult(request, result);
    expect(text).toContain("Cannot rename symbol");
    expect(text).toContain("/src/utils.ts:2:17");
    expect(text).toContain("You cannot rename this element.");
  });
});
```

- [ ] **Step 2: Write failing call hierarchy formatter tests**

Create `tests/tools/call-hierarchy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type {
  CallHierarchyRequest,
  CallHierarchyResult,
} from "../../src/providers/semantic-provider.js";
import { formatCallHierarchyResult } from "../../src/tools/call-hierarchy.js";

describe("formatCallHierarchyResult", () => {
  const request: CallHierarchyRequest = {
    file: "/src/utils.ts",
    line: 2,
    column: 17,
    direction: "both",
  };

  it("reports no item found", () => {
    const result: CallHierarchyResult = { item: null };
    const text = formatCallHierarchyResult(request, result);
    expect(text).toContain("No call hierarchy item");
    expect(text).toContain("/src/utils.ts:2:17");
  });

  it("formats incoming calls", () => {
    const result: CallHierarchyResult = {
      item: { name: "add", kind: "function", file: "/src/utils.ts", line: 2, column: 17 },
      incoming: [
        { from: { name: "main", kind: "function", file: "/src/index.ts", line: 6, column: 1, containerName: "<module>" } },
      ],
    };
    const text = formatCallHierarchyResult({ ...request, direction: "incoming" }, result);
    expect(text).toContain("add [function]");
    expect(text).toContain("Incoming calls (1)");
    expect(text).toContain("<- main");
    expect(text).toContain("(in <module>)");
    expect(text).toContain("/src/index.ts:6");
  });

  it("formats outgoing calls", () => {
    const result: CallHierarchyResult = {
      item: { name: "main", kind: "function", file: "/src/index.ts", line: 6, column: 1 },
      outgoing: [
        { to: { name: "add", kind: "function", file: "/src/utils.ts", line: 2, column: 17 } },
        { to: { name: "createGreeting", kind: "function", file: "/src/utils.ts", line: 12, column: 1 } },
      ],
    };
    const text = formatCallHierarchyResult({ ...request, direction: "outgoing" }, result);
    expect(text).toContain("Outgoing calls (2)");
    expect(text).toContain("-> add [function]");
    expect(text).toContain("-> createGreeting [function]");
  });

  it("shows both incoming and outgoing", () => {
    const result: CallHierarchyResult = {
      item: { name: "add", kind: "function", file: "/src/utils.ts", line: 2, column: 17 },
      incoming: [{ from: { name: "main", kind: "function", file: "/src/index.ts", line: 6, column: 1 } }],
      outgoing: [],
    };
    const text = formatCallHierarchyResult(request, result);
    expect(text).toContain("Incoming calls (1)");
    expect(text).toContain("Outgoing calls (0)");
    expect(text).toContain("(none)");
  });
});
```

- [ ] **Step 3: Run to verify failure**

```sh
pnpm test tests/tools/rename.test.ts tests/tools/call-hierarchy.test.ts
```

Expected: import errors for missing files.

- [ ] **Step 4: Implement src/tools/rename.ts**

```ts
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  FileLocation,
  RenameRequest,
  RenameResult,
  SemanticProvider,
} from "../providers/semantic-provider.js";
import { textResult } from "./text-result.js";

export function formatRenameResult(
  request: RenameRequest,
  result: RenameResult,
): string {
  if (!result.canRename) {
    return (
      `Cannot rename symbol at ${request.file}:${request.line}:${request.column}: ` +
      (result.reason ?? "unknown reason")
    );
  }

  const totalLocs = result.locations.length;
  const fileCount = new Set(result.locations.map((l) => l.file)).size;
  const displayName = result.displayName ?? "symbol";

  const lines = [
    `Rename "${displayName}" -> "${request.newName}"`,
    `${totalLocs} location(s) across ${fileCount} file(s):\n`,
  ];

  const byFile = new Map<string, typeof result.locations>();
  for (const loc of result.locations) {
    const existing = byFile.get(loc.file) ?? [];
    byFile.set(loc.file, [...existing, loc]);
  }

  for (const [file, locs] of byFile) {
    lines.push(`  ${file}:`);
    for (const loc of locs) {
      const range = `L${loc.line}:${loc.column}-L${loc.endLine}:${loc.endColumn}`;
      const extras =
        loc.prefixText || loc.suffixText
          ? ` (prefix: "${loc.prefixText ?? ""}", suffix: "${loc.suffixText ?? ""}")`
          : "";
      lines.push(`    ${range}${extras}`);
    }
  }

  lines.push(`\nApply: Replace the old name with "${request.newName}" at each location above.`);
  return lines.join("\n");
}

export function createRenameTool(provider: SemanticProvider) {
  return async function rename(
    input: RenameRequest,
  ): Promise<CallToolResult> {
    const result = await provider.getRename(input);
    return textResult(formatRenameResult(input, result));
  };
}
```

- [ ] **Step 5: Implement src/tools/call-hierarchy.ts**

```ts
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  CallHierarchyItemInfo,
  CallHierarchyRequest,
  CallHierarchyResult,
  SemanticProvider,
} from "../providers/semantic-provider.js";
import { textResult } from "./text-result.js";

function formatItem(item: CallHierarchyItemInfo): string {
  const container = item.containerName ? ` (in ${item.containerName})` : "";
  return `${item.name}${container} [${item.kind}] at ${item.file}:${item.line}`;
}

export function formatCallHierarchyResult(
  request: CallHierarchyRequest,
  result: CallHierarchyResult,
): string {
  if (result.item === null) {
    return `No call hierarchy item at ${request.file}:${request.line}:${request.column}`;
  }

  const lines = [`Call hierarchy for: ${formatItem(result.item)}\n`];

  if (request.direction === "incoming" || request.direction === "both") {
    const incoming = result.incoming ?? [];
    lines.push(`  Incoming calls (${incoming.length}):`);
    if (incoming.length === 0) {
      lines.push("    (none)");
    } else {
      for (const call of incoming) {
        lines.push(`    <- ${formatItem(call.from)}`);
      }
    }
    lines.push("");
  }

  if (request.direction === "outgoing" || request.direction === "both") {
    const outgoing = result.outgoing ?? [];
    lines.push(`  Outgoing calls (${outgoing.length}):`);
    if (outgoing.length === 0) {
      lines.push("    (none)");
    } else {
      for (const call of outgoing) {
        lines.push(`    -> ${formatItem(call.to)}`);
      }
    }
  }

  return lines.join("\n");
}

export function createCallHierarchyTool(provider: SemanticProvider) {
  return async function callHierarchy(
    input: CallHierarchyRequest,
  ): Promise<CallToolResult> {
    const result = await provider.getCallHierarchy(input);
    return textResult(formatCallHierarchyResult(input, result));
  };
}
```

- [ ] **Step 6: Run formatter tests**

```sh
pnpm test tests/tools/rename.test.ts tests/tools/call-hierarchy.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```sh
git add src/tools/rename.ts src/tools/call-hierarchy.ts tests/tools/rename.test.ts tests/tools/call-hierarchy.test.ts
git commit -m "feat: add rename and call hierarchy tool formatters and handlers"
```

---

## Task 4: Provider Implementation

**Files:**
- Modify: `src/providers/lsp-semantic-provider.ts`
- Modify: `tests/providers/lsp-semantic-provider.test.ts`

- [ ] **Step 1: Write failing provider tests**

Add to `tests/providers/lsp-semantic-provider.test.ts`:

```ts
it("includes rename and call_hierarchy in supported tools", async () => {
  const manager: LspProviderSessionManager = {
    getSummary: vi.fn(),
    ensureSession: vi.fn().mockResolvedValue({
      info: {
        state: "ready" as const,
        message: "TypeScript LSP initialized.",
        serverCapabilities: [],
      },
      session: {},
    }),
  };
  const provider = new LspSemanticProvider({ manager });

  const caps = await provider.getCapabilities({ check: true, file: "src/index.ts" });
  expect(caps.supportedTools).toContain("rename");
  expect(caps.supportedTools).toContain("call_hierarchy");
});

it("getRename returns canRename=false when prepareRename returns null", async () => {
  const mockConnection = {
    listen: vi.fn(),
    sendRequest: vi.fn().mockResolvedValue(null),
    sendNotification: vi.fn().mockResolvedValue(undefined),
    onNotification: vi.fn(),
    dispose: vi.fn(),
  };
  const manager: LspProviderSessionManager = {
    getSummary: vi.fn(),
    ensureSession: vi.fn().mockResolvedValue({
      info: { state: "ready" as const, message: "ready", serverCapabilities: [] },
      session: {
        getConnection: vi.fn(() => mockConnection),
        prepareFile: vi.fn().mockResolvedValue("opened"),
      },
    }),
  };
  const provider = new LspSemanticProvider({ manager });

  const result = await provider.getRename({
    file: "/tmp/a.ts",
    line: 1,
    column: 1,
    newName: "newName",
  });

  expect(result.canRename).toBe(false);
  expect(result.locations).toHaveLength(0);
});
```

- [ ] **Step 2: Run to verify failure**

```sh
pnpm test tests/providers/lsp-semantic-provider.test.ts
```

Expected: fail - getRename/getCallHierarchy not implemented yet.

- [ ] **Step 3: Add SymbolKind mapping constant and helper to lsp-semantic-provider.ts**

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

function symbolKindName(kind: number): string {
  return SYMBOL_KIND_NAMES[kind] ?? "unknown";
}
```

- [ ] **Step 4: Update supportedTools array**

Change:

```ts
const supportedTools = [
  "health",
  "capabilities",
  "goto_definition",
  "find_references",
  "hover",
  "diagnostics",
];
```

To:

```ts
const supportedTools = [
  "health",
  "capabilities",
  "goto_definition",
  "find_references",
  "hover",
  "diagnostics",
  "rename",
  "call_hierarchy",
];
```

- [ ] **Step 5: Implement getRename in LspSemanticProvider**

Add after getDiagnostics:

```ts
async getRename(request: RenameRequest): Promise<RenameResult> {
  const { info, session } = await this.manager.ensureSession(request.file);
  if (info.state !== "ready") {
    throw new Error(`LSP session not ready: ${info.message}`);
  }

  const uri = pathToFileURL(request.file).toString();
  const position = {
    line: request.line - 1,
    character: request.column - 1,
  };
  const languageId = languageIdForFile(request.file);

  await session.prepareFile(request.file, languageId);

  const connection = session.getConnection();
  if (connection === undefined) throw new Error("LSP connection unavailable.");

  const prepared = await requestPrepareRename(connection, uri, position);
  if (prepared === null) {
    return {
      canRename: false,
      reason: "This symbol cannot be renamed.",
      locations: [],
    };
  }

  // Extract display name from prepare result (placeholder variant has it)
  const displayName =
    prepared !== null &&
    typeof prepared === "object" &&
    "placeholder" in (prepared as object)
      ? String((prepared as { placeholder: string }).placeholder)
      : undefined;

  const edit = await requestRename(connection, uri, position, request.newName);
  if (edit === null) {
    return {
      canRename: false,
      reason: "Rename returned no edits.",
      locations: [],
    };
  }

  const locations: RenameLocation[] = [];
  for (const [docUri, edits] of Object.entries(edit.changes ?? {})) {
    const file = fileURLToPath(docUri);
    for (const textEdit of edits) {
      locations.push({
        file,
        line: textEdit.range.start.line + 1,
        column: textEdit.range.start.character + 1,
        endLine: textEdit.range.end.line + 1,
        endColumn: textEdit.range.end.character + 1,
      });
    }
  }

  return { canRename: true, displayName, locations };
}
```

- [ ] **Step 6: Implement getCallHierarchy in LspSemanticProvider**

```ts
async getCallHierarchy(request: CallHierarchyRequest): Promise<CallHierarchyResult> {
  const { info, session } = await this.manager.ensureSession(request.file);
  if (info.state !== "ready") {
    throw new Error(`LSP session not ready: ${info.message}`);
  }

  const uri = pathToFileURL(request.file).toString();
  const position = {
    line: request.line - 1,
    character: request.column - 1,
  };

  await session.prepareFile(request.file, languageIdForFile(request.file));

  const connection = session.getConnection();
  if (connection === undefined) throw new Error("LSP connection unavailable.");

  const items = await requestPrepareCallHierarchy(connection, uri, position);
  if (!items || items.length === 0) {
    return { item: null };
  }

  const lspItem = items[0];
  const item: CallHierarchyItemInfo = {
    name: lspItem.name,
    kind: symbolKindName(lspItem.kind),
    file: fileURLToPath(lspItem.uri),
    line: lspItem.selectionRange.start.line + 1,
    column: lspItem.selectionRange.start.character + 1,
    containerName: lspItem.detail ?? undefined,
  };

  const result: CallHierarchyResult = { item };

  if (request.direction === "incoming" || request.direction === "both") {
    const incomingLsp = await requestCallHierarchyIncoming(connection, lspItem);
    result.incoming = (incomingLsp ?? []).map((c) => ({
      from: {
        name: c.from.name,
        kind: symbolKindName(c.from.kind),
        file: fileURLToPath(c.from.uri),
        line: c.from.selectionRange.start.line + 1,
        column: c.from.selectionRange.start.character + 1,
        containerName: c.from.detail ?? undefined,
      },
    }));
  }

  if (request.direction === "outgoing" || request.direction === "both") {
    const outgoingLsp = await requestCallHierarchyOutgoing(connection, lspItem);
    result.outgoing = (outgoingLsp ?? []).map((c) => ({
      to: {
        name: c.to.name,
        kind: symbolKindName(c.to.kind),
        file: fileURLToPath(c.to.uri),
        line: c.to.selectionRange.start.line + 1,
        column: c.to.selectionRange.start.character + 1,
        containerName: c.to.detail ?? undefined,
      },
    }));
  }

  return result;
}
```

- [ ] **Step 7: Add new imports to lsp-semantic-provider.ts**

Add to the `semantic-requests.ts` import:

```ts
import {
  requestCallHierarchyIncoming,
  requestCallHierarchyOutgoing,
  requestDefinition,
  requestHover,
  requestPrepareCallHierarchy,
  requestPrepareRename,
  requestReferences,
  requestRename,
} from "../lsp/semantic-requests.js";
```

Add to the `semantic-provider.ts` import:

```ts
import type {
  CallHierarchyRequest,
  CallHierarchyResult,
  CallHierarchyItemInfo,
  // ... existing imports ...
  RenameLocation,
  RenameRequest,
  RenameResult,
} from "./semantic-provider.js";
```

- [ ] **Step 8: Run provider tests**

```sh
pnpm test tests/providers/
```

Expected: all pass.

- [ ] **Step 9: Commit**

```sh
git add src/providers/lsp-semantic-provider.ts tests/providers/lsp-semantic-provider.test.ts
git commit -m "feat: implement getRename and getCallHierarchy in LspSemanticProvider"
```

---

## Task 5: Server Registration

**Files:**
- Modify: `src/server.ts`
- Modify: `tests/server.test.ts`

- [ ] **Step 1: Write failing server test**

In `tests/server.test.ts`, find the test that checks registered tools and update it to assert 8 tools including `rename` and `call_hierarchy`. Run it to confirm it fails.

```sh
pnpm test tests/server.test.ts
```

Expected: test finding registered tool names fails (missing rename/call_hierarchy).

- [ ] **Step 2: Add schemas and registration to server.ts**

Add input schemas after existing `diagnosticsInputSchema`:

```ts
export const renameInputSchema = {
  ...fileLocationInputSchema,
  newName: z.string().describe("New name for the symbol"),
};

export const callHierarchyInputSchema = {
  ...fileLocationInputSchema,
  direction: z
    .enum(["incoming", "outgoing", "both"])
    .describe("Direction of call hierarchy"),
};
```

Add imports:

```ts
import { createCallHierarchyTool } from "./tools/call-hierarchy.js";
import { createRenameTool } from "./tools/rename.js";
```

Register both tools (after the `diagnostics` registration):

```ts
server.registerTool(
  "rename",
  {
    description:
      "Find all locations that must change to rename a symbol. " +
      "Returns file paths and positions only - does NOT apply changes automatically. " +
      "Use the Edit tool to apply the rename at each returned location. " +
      "USE THIS INSTEAD OF grep+replace when renaming symbols - it understands scope and " +
      "will not produce false positives from comments, strings, or different-scope variables with the same name.",
    inputSchema: renameInputSchema,
  },
  createRenameTool(provider),
);

server.registerTool(
  "call_hierarchy",
  {
    description:
      "Get the directed call graph for a function or method. " +
      "Unlike find_references (which lists all symbol usages including type references, re-exports, and assignments), " +
      "this shows only actual function call relationships with caller/callee direction and container context. " +
      'USE THIS INSTEAD OF grep when tracing "who calls this function" or "what does this function call". ' +
      "Returns structured caller/callee data with container function names - more precise than text search. " +
      'Use "incoming" for callers, "outgoing" for callees, "both" for full graph.',
    inputSchema: callHierarchyInputSchema,
  },
  createCallHierarchyTool(provider),
);
```

- [ ] **Step 3: Run server test**

```sh
pnpm test tests/server.test.ts
```

Expected: all pass.

- [ ] **Step 4: Run full test suite**

```sh
pnpm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```sh
git add src/server.ts tests/server.test.ts
git commit -m "feat: register rename and call_hierarchy MCP tools"
```

---

## Task 6: Integration Tests

**Files:**
- Modify: `tests/integration/semantic-tools.test.ts`

The fixture `tests/fixtures/sample-project/src/index.ts` already has `main` calling `add` and `createGreeting`, which is sufficient for call hierarchy. Rename coverage uses `add` in `utils.ts`.

- [ ] **Step 1: Add integration tests**

Append to `tests/integration/semantic-tools.test.ts`:

```ts
it("rename add returns locations in utils.ts and index.ts", async () => {
  // utils.ts line 2: `export function add(a: number, b: number): number {`
  // "add" at col 17 (1-based) -> char 16 (0-based)
  await session.prepareFile(UTILS_FILE, "typescript");
  await session.prepareFile(INDEX_FILE, "typescript");

  const provider = new LspSemanticProvider({
    manager: {
      getSummary() {
        const info = session.getInfo();
        return { state: info.state, message: info.message, serverCapabilities: info.serverCapabilities };
      },
      async ensureSession() {
        return { info: session.getInfo(), session };
      },
    },
  });

  const result = await provider.getRename({
    file: UTILS_FILE,
    line: 2,
    column: 17,
    newName: "sum",
  });

  expect(result.canRename).toBe(true);
  expect(result.locations.length).toBeGreaterThanOrEqual(2);
  const files = result.locations.map((l) => l.file);
  expect(files.some((f) => f.includes("utils.ts"))).toBe(true);
  expect(files.some((f) => f.includes("index.ts"))).toBe(true);
}, 15_000);

it("call hierarchy incoming on add returns callers from index.ts", async () => {
  await session.prepareFile(UTILS_FILE, "typescript");
  await session.prepareFile(INDEX_FILE, "typescript");

  const provider = new LspSemanticProvider({
    manager: {
      getSummary() {
        const info = session.getInfo();
        return { state: info.state, message: info.message, serverCapabilities: info.serverCapabilities };
      },
      async ensureSession() {
        return { info: session.getInfo(), session };
      },
    },
  });

  const result = await provider.getCallHierarchy({
    file: UTILS_FILE,
    line: 2,
    column: 17,
    direction: "incoming",
  });

  expect(result.item).not.toBeNull();
  expect(result.item?.name).toBe("add");
  expect(result.incoming).toBeDefined();
  expect(result.incoming!.length).toBeGreaterThan(0);
  expect(result.incoming!.some((c) => c.from.file.includes("index.ts"))).toBe(true);
}, 15_000);

it("call hierarchy outgoing on main returns add and createGreeting callees", async () => {
  await session.prepareFile(INDEX_FILE, "typescript");
  await session.prepareFile(UTILS_FILE, "typescript");

  const provider = new LspSemanticProvider({
    manager: {
      getSummary() {
        const info = session.getInfo();
        return { state: info.state, message: info.message, serverCapabilities: info.serverCapabilities };
      },
      async ensureSession() {
        return { info: session.getInfo(), session };
      },
    },
  });

  // index.ts line 6: `export function main(): void {`
  // "main" at col 17 (1-based)
  const result = await provider.getCallHierarchy({
    file: INDEX_FILE,
    line: 6,
    column: 17,
    direction: "outgoing",
  });

  expect(result.item).not.toBeNull();
  expect(result.item?.name).toBe("main");
  expect(result.outgoing).toBeDefined();
  const calleeNames = result.outgoing!.map((c) => c.to.name);
  expect(calleeNames).toContain("add");
  expect(calleeNames).toContain("createGreeting");
}, 15_000);
```

- [ ] **Step 2: Run integration tests**

```sh
pnpm test tests/integration/
```

Expected: all pass (may take ~30s for LSP startup).

- [ ] **Step 3: Run full suite + checks**

```sh
pnpm test && pnpm check && pnpm build
```

Expected: all pass, no type errors, clean build.

- [ ] **Step 4: Commit**

```sh
git add tests/integration/semantic-tools.test.ts
git commit -m "test: add integration tests for rename and call hierarchy"
```

---

## Acceptance

After all tasks complete, run:

```sh
pnpm test
pnpm check
pnpm build
```

All commands must pass with zero errors. The `call_hierarchy` and `rename` tools must appear in the `capabilities` MCP tool output.
