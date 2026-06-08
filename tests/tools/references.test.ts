import { describe, expect, it } from "vitest";
import type {
  FileLocation,
  ReferencesResult,
} from "../../src/providers/semantic-provider.js";
import { formatReferencesResult } from "../../src/tools/references.js";

describe("formatReferencesResult", () => {
  const location: FileLocation = { file: "/src/utils.ts", line: 3, column: 10 };

  it("groups references by file", () => {
    const result: ReferencesResult = {
      references: [
        {
          file: "/src/utils.ts",
          line: 3,
          column: 10,
          isDefinition: true,
          isWriteAccess: true,
        },
        {
          file: "/src/index.ts",
          line: 1,
          column: 15,
          isDefinition: false,
          isWriteAccess: false,
        },
        {
          file: "/src/index.ts",
          line: 5,
          column: 8,
          isDefinition: false,
          isWriteAccess: false,
        },
      ],
    };
    const text = formatReferencesResult(location, result);
    expect(text).toContain("3 total");
    expect(text).toContain("/src/utils.ts:");
    expect(text).toContain("/src/index.ts:");
    expect(text).toContain("[def, write]");
    expect(text).toContain("[read]");
  });

  it("reports no references found", () => {
    const result: ReferencesResult = { references: [] };
    const text = formatReferencesResult(location, result);
    expect(text).toContain("No references found");
  });
});
