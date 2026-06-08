// tests/lsp/semantic-requests.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  requestDefinition,
  requestHover,
  requestReferences,
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
