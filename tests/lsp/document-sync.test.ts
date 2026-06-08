// tests/lsp/document-sync.test.ts
import { describe, expect, it, vi } from "vitest";
import { DocumentSync } from "../../src/lsp/document-sync.js";
import type { LspConnection } from "../../src/lsp/types.js";

function createMockConnection(): LspConnection {
  return {
    listen: vi.fn(),
    sendRequest: vi.fn().mockResolvedValue(undefined),
    sendNotification: vi.fn().mockResolvedValue(undefined),
    onNotification: vi.fn(),
    dispose: vi.fn(),
  } as unknown as LspConnection;
}

describe("DocumentSync", () => {
  it("sends didOpen on first access to a file", async () => {
    const connection = createMockConnection();
    const readFile = vi.fn().mockResolvedValue("const x = 1;");
    const sync = new DocumentSync(connection, readFile);

    await sync.prepareFile("/workspace/src/index.ts", "typescript");

    expect(connection.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ method: "textDocument/didOpen" }),
      expect.objectContaining({
        textDocument: expect.objectContaining({
          uri: "file:///workspace/src/index.ts",
          languageId: "typescript",
          version: 1,
          text: "const x = 1;",
        }),
      }),
    );
  });

  it("sends didChange on subsequent access with different content", async () => {
    const connection = createMockConnection();
    let content = "const x = 1;";
    const readFile = vi.fn().mockImplementation(() => Promise.resolve(content));
    const sync = new DocumentSync(connection, readFile);

    await sync.prepareFile("/workspace/src/index.ts", "typescript");

    content = "const x = 2;";
    await sync.prepareFile("/workspace/src/index.ts", "typescript");

    expect(connection.sendNotification).toHaveBeenCalledTimes(2);
    expect(connection.sendNotification).toHaveBeenLastCalledWith(
      expect.objectContaining({ method: "textDocument/didChange" }),
      expect.objectContaining({
        textDocument: expect.objectContaining({ version: 2 }),
        contentChanges: [{ text: "const x = 2;" }],
      }),
    );
  });

  it("does not send didChange when content is unchanged", async () => {
    const connection = createMockConnection();
    const readFile = vi.fn().mockResolvedValue("const x = 1;");
    const sync = new DocumentSync(connection, readFile);

    await sync.prepareFile("/workspace/src/index.ts", "typescript");
    await sync.prepareFile("/workspace/src/index.ts", "typescript");

    expect(connection.sendNotification).toHaveBeenCalledTimes(1);
  });
});
