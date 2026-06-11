import { describe, expect, it } from "vitest";
import type {
  FileLocation,
  TypeDefinitionResult,
} from "../../src/providers/semantic-provider.js";
import { formatTypeDefinitionResult } from "../../src/tools/type-definition.js";

describe("formatTypeDefinitionResult", () => {
  const location: FileLocation = { file: "/src/utils.ts", line: 5, column: 10 };

  it("reports no type definition found", () => {
    const result: TypeDefinitionResult = { locations: [] };
    const text = formatTypeDefinitionResult(location, result);
    expect(text).toContain("No type definition found");
    expect(text).toContain("/src/utils.ts:5:10");
  });

  it("formats a single type definition location", () => {
    const result: TypeDefinitionResult = {
      locations: [{ file: "/src/types.ts", line: 3, column: 1 }],
    };
    const text = formatTypeDefinitionResult(location, result);
    expect(text).toContain("Type definition(s)");
    expect(text).toContain("/src/utils.ts:5:10");
    expect(text).toContain("/src/types.ts:3:1");
  });

  it("formats multiple type definition locations", () => {
    const result: TypeDefinitionResult = {
      locations: [
        { file: "/src/types.ts", line: 3, column: 1 },
        { file: "/src/other.ts", line: 10, column: 5 },
      ],
    };
    const text = formatTypeDefinitionResult(location, result);
    expect(text).toContain("/src/types.ts:3:1");
    expect(text).toContain("/src/other.ts:10:5");
  });
});
