// tests/lsp/semantic-requests.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  requestCallHierarchyIncoming,
  requestCallHierarchyOutgoing,
  requestDefinition,
  requestHover,
  requestPrepareCallHierarchy,
  requestPrepareRename,
  requestReferences,
  requestRename,
} from "../../src/lsp/semantic-requests.js";
import type { LspConnection } from "../../src/lsp/types.js";

function mockConnection(response: unknown): LspConnection {
  return {
    listen: vi.fn(),
    sendRequest: vi.fn().mockResolvedValue(response),
    sendNotification: vi.fn().mockResolvedValue(undefined),
    onNotification: vi.fn(),
    dispose: vi.fn(),
  };
}

describe("requestDefinition", () => {
  it("sends textDocument/definition request", async () => {
    const loc = {
      uri: "file:///a.ts",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 3 },
      },
    };
    const conn = mockConnection([loc]);

    await requestDefinition(conn, "file:///b.ts", { line: 5, character: 10 });

    expect(conn.sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: "textDocument/definition" }),
      {
        textDocument: { uri: "file:///b.ts" },
        position: { line: 5, character: 10 },
      },
    );
  });
});

describe("requestReferences", () => {
  it("sends textDocument/references with includeDeclaration", async () => {
    const conn = mockConnection([]);

    await requestReferences(conn, "file:///a.ts", { line: 1, character: 5 });

    expect(conn.sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: "textDocument/references" }),
      expect.objectContaining({
        context: { includeDeclaration: true },
      }),
    );
  });
});

describe("requestHover", () => {
  it("sends textDocument/hover request", async () => {
    const conn = mockConnection({
      contents: {
        kind: "markdown",
        value: "```typescript\nconst x: number\n```",
      },
    });

    await requestHover(conn, "file:///a.ts", { line: 2, character: 5 });

    expect(conn.sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: "textDocument/hover" }),
      {
        textDocument: { uri: "file:///a.ts" },
        position: { line: 2, character: 5 },
      },
    );
  });
});

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
