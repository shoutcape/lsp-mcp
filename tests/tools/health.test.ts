import { describe, expect, it } from "vitest";

import { createHealthTool, formatHealthText } from "../../src/tools/health.js";

describe("health tool output", () => {
  it("formats provider health info as stable plain text", () => {
    expect(
      formatHealthText({
        status: "not_started",
        message: "LSP sessions are not implemented in this scaffold.",
      }),
    ).toBe(
      [
        "Status: not_started",
        "Tool: health",
        "Message: LSP sessions are not implemented in this scaffold.",
      ].join("\n"),
    );
  });

  it("returns MCP text content from provider health", async () => {
    const handler = createHealthTool({
      async getHealth() {
        return {
          status: "not_started" as const,
          message: "LSP sessions are not implemented in this scaffold.",
        };
      },
      async getCapabilities() {
        throw new Error("not used");
      },
    });

    await expect(handler()).resolves.toEqual({
      content: [
        {
          type: "text",
          text: [
            "Status: not_started",
            "Tool: health",
            "Message: LSP sessions are not implemented in this scaffold.",
          ].join("\n"),
        },
      ],
    });
  });

  it("forwards active check input to the provider", async () => {
    const seenRequests: unknown[] = [];
    const handler = createHealthTool({
      async getHealth(request) {
        seenRequests.push(request);
        return {
          status: "ready" as const,
          message: "TypeScript LSP initialized.",
        };
      },
      async getCapabilities() {
        throw new Error("not used");
      },
    });

    await expect(
      handler({ check: true, file: "src/index.ts" }),
    ).resolves.toEqual({
      content: [
        {
          type: "text",
          text: [
            "Status: ready",
            "Tool: health",
            "Message: TypeScript LSP initialized.",
          ].join("\n"),
        },
      ],
    });
    expect(seenRequests).toEqual([{ check: true, file: "src/index.ts" }]);
  });
});
