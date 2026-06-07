import { describe, expect, it } from "vitest";

import {
  createCapabilitiesTool,
  formatCapabilitiesText,
} from "../../src/tools/capabilities.js";

describe("capabilities tool output", () => {
  it("formats provider capabilities as stable plain text", () => {
    expect(
      formatCapabilitiesText({
        status: "ready",
        supportedTools: ["health", "capabilities"],
        lsp: "not_implemented",
      }),
    ).toBe(
      [
        "Status: ready",
        "Tool: capabilities",
        "Supported tools: health, capabilities",
        "LSP: not implemented",
      ].join("\n"),
    );
  });

  it("returns MCP text content from provider capabilities", async () => {
    const handler = createCapabilitiesTool({
      async getHealth() {
        throw new Error("not used");
      },
      async getCapabilities() {
        return {
          status: "ready" as const,
          supportedTools: ["health", "capabilities"],
          lsp: "not_implemented" as const,
        };
      },
    });

    await expect(handler()).resolves.toEqual({
      content: [
        {
          type: "text",
          text: [
            "Status: ready",
            "Tool: capabilities",
            "Supported tools: health, capabilities",
            "LSP: not implemented",
          ].join("\n"),
        },
      ],
    });
  });
});
