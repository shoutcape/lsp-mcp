import { describe, expect, it } from "vitest";
import type {
  DefinitionResult,
  FileLocation,
} from "../../src/providers/semantic-provider.js";
import { formatDefinitionResult } from "../../src/tools/definition.js";

describe("formatDefinitionResult", () => {
  const location: FileLocation = { file: "/src/index.ts", line: 5, column: 10 };

  it("formats single definition", () => {
    const result: DefinitionResult = {
      definitions: [{ file: "/src/utils.ts", line: 3, column: 1 }],
    };
    const text = formatDefinitionResult(location, result);
    expect(text).toContain("/src/utils.ts:3:1");
  });

  it("formats multiple definitions", () => {
    const result: DefinitionResult = {
      definitions: [
        { file: "/src/a.ts", line: 1, column: 1 },
        { file: "/src/b.ts", line: 10, column: 5 },
      ],
    };
    const text = formatDefinitionResult(location, result);
    expect(text).toContain("/src/a.ts:1:1");
    expect(text).toContain("/src/b.ts:10:5");
  });

  it("reports no definition found", () => {
    const result: DefinitionResult = { definitions: [] };
    const text = formatDefinitionResult(location, result);
    expect(text).toContain("No definition found");
  });
});
