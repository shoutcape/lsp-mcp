import { describe, expect, it } from "vitest";
import type {
  FileLocation,
  HoverResult,
} from "../../src/providers/semantic-provider.js";
import { formatHoverResult } from "../../src/tools/hover.js";

describe("formatHoverResult", () => {
  const location: FileLocation = { file: "/src/index.ts", line: 3, column: 7 };

  it("formats hover content", () => {
    const result: HoverResult = { content: "const result: number" };
    const text = formatHoverResult(location, result);
    expect(text).toContain("const result: number");
    expect(text).toContain("/src/index.ts:3:7");
  });

  it("reports no type information when content is empty", () => {
    const result: HoverResult = { content: "" };
    const text = formatHoverResult(location, result);
    expect(text).toContain("No type information");
  });
});
