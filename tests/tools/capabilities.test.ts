import { describe, expect, it } from "vitest";

import { getCapabilitiesText } from "../../src/tools/capabilities.js";

describe("capabilities tool output", () => {
  it("lists only scaffold tools", () => {
    expect(getCapabilitiesText()).toBe(
      [
        "Status: ready",
        "Tool: capabilities",
        "Supported tools: health, capabilities",
        "LSP: not implemented",
      ].join("\n"),
    );
  });
});
