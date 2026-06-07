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
});
