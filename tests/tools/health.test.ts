import { describe, expect, it } from "vitest";

import { getHealthText } from "../../src/tools/health.js";

describe("health tool output", () => {
  it("reports static not_started scaffold state", () => {
    expect(getHealthText()).toBe(
      [
        "Status: not_started",
        "Tool: health",
        "Message: LSP sessions are not implemented in this scaffold.",
      ].join("\n"),
    );
  });
});
