import { describe, expect, it } from "vitest";
import type {
  RenameRequest,
  RenameResult,
} from "../../src/providers/semantic-provider.js";
import { formatRenameResult } from "../../src/tools/rename.js";

describe("formatRenameResult", () => {
  const request: RenameRequest = {
    file: "/src/utils.ts",
    line: 2,
    column: 17,
    newName: "sum",
  };

  it("formats multi-file success result", () => {
    const result: RenameResult = {
      canRename: true,
      displayName: "add",
      locations: [
        {
          file: "/src/utils.ts",
          line: 2,
          column: 17,
          endLine: 2,
          endColumn: 20,
        },
        {
          file: "/src/index.ts",
          line: 1,
          column: 10,
          endLine: 1,
          endColumn: 13,
        },
        {
          file: "/src/index.ts",
          line: 3,
          column: 16,
          endLine: 3,
          endColumn: 19,
        },
      ],
    };
    const text = formatRenameResult(request, result);
    expect(text).toContain('Rename "add" -> "sum"');
    expect(text).toContain("3 location(s) across 2 file(s)");
    expect(text).toContain("/src/utils.ts:");
    expect(text).toContain("L2:17-L2:20");
    expect(text).toContain("/src/index.ts:");
    expect(text).toContain("L1:10-L1:13");
    expect(text).toContain("L3:16-L3:19");
    expect(text).toContain('Apply: Replace the old name with "sum"');
  });

  it("formats location with prefix and suffix context", () => {
    const result: RenameResult = {
      canRename: true,
      displayName: "add",
      locations: [
        {
          file: "/src/a.ts",
          line: 5,
          column: 3,
          endLine: 5,
          endColumn: 6,
          prefixText: "obj.",
          suffixText: "(",
        },
      ],
    };
    const text = formatRenameResult(request, result);
    expect(text).toContain('prefix: "obj."');
    expect(text).toContain('suffix: "("');
  });

  it("reports cannot rename with reason", () => {
    const result: RenameResult = {
      canRename: false,
      reason: "You cannot rename this element.",
      locations: [],
    };
    const text = formatRenameResult(request, result);
    expect(text).toContain("Cannot rename symbol");
    expect(text).toContain("/src/utils.ts:2:17");
    expect(text).toContain("You cannot rename this element.");
  });
});
