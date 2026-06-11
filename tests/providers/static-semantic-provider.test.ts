import { describe, expect, it } from "vitest";

import { StaticSemanticProvider } from "../../src/providers/static-semantic-provider.js";

describe("StaticSemanticProvider", () => {
  it("reports scaffold health", async () => {
    const provider = new StaticSemanticProvider();

    await expect(provider.getHealth()).resolves.toEqual({
      status: "not_started",
      message: "LSP sessions are not implemented in this scaffold.",
    });
  });

  it("reports scaffold capabilities", async () => {
    const provider = new StaticSemanticProvider();

    await expect(provider.getCapabilities()).resolves.toEqual({
      status: "ready",
      supportedTools: ["health", "capabilities"],
      lsp: "not_implemented",
    });
  });

  it("getTypeDefinition returns empty locations", async () => {
    const provider = new StaticSemanticProvider();
    await expect(
      provider.getTypeDefinition({ file: "a.ts", line: 1, column: 1 }),
    ).resolves.toEqual({ locations: [] });
  });

  it("getImplementation returns empty locations", async () => {
    const provider = new StaticSemanticProvider();
    await expect(
      provider.getImplementation({ file: "a.ts", line: 1, column: 1 }),
    ).resolves.toEqual({ locations: [] });
  });

  it("getDocumentSymbols returns empty symbols", async () => {
    const provider = new StaticSemanticProvider();
    await expect(provider.getDocumentSymbols("a.ts")).resolves.toEqual({
      symbols: [],
    });
  });

  it("getWorkspaceSymbols returns empty symbols", async () => {
    const provider = new StaticSemanticProvider();
    await expect(
      provider.getWorkspaceSymbols({ query: "foo" }),
    ).resolves.toEqual({ symbols: [] });
  });

  it("getSignatureHelp returns empty result", async () => {
    const provider = new StaticSemanticProvider();
    await expect(
      provider.getSignatureHelp({ file: "a.ts", line: 1, column: 1 }),
    ).resolves.toEqual({
      signatures: [],
      activeSignature: 0,
      activeParameter: 0,
    });
  });
});
