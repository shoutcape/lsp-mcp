import { describe, expect, it } from "vitest";
import type {
  FileLocation,
  ImplementationResult,
} from "../../src/providers/semantic-provider.js";
import { formatImplementationResult } from "../../src/tools/implementation.js";

describe("formatImplementationResult", () => {
  const location: FileLocation = { file: "/src/iface.ts", line: 2, column: 14 };

  it("reports no implementation found", () => {
    const result: ImplementationResult = { locations: [] };
    const text = formatImplementationResult(location, result);
    expect(text).toContain("No implementation found");
    expect(text).toContain("/src/iface.ts:2:14");
  });

  it("formats a single implementation location", () => {
    const result: ImplementationResult = {
      locations: [{ file: "/src/impl.ts", line: 10, column: 3 }],
    };
    const text = formatImplementationResult(location, result);
    expect(text).toContain("Implementation(s)");
    expect(text).toContain("/src/iface.ts:2:14");
    expect(text).toContain("/src/impl.ts:10:3");
  });

  it("formats multiple implementation locations", () => {
    const result: ImplementationResult = {
      locations: [
        { file: "/src/impl-a.ts", line: 5, column: 1 },
        { file: "/src/impl-b.ts", line: 8, column: 1 },
      ],
    };
    const text = formatImplementationResult(location, result);
    expect(text).toContain("/src/impl-a.ts:5:1");
    expect(text).toContain("/src/impl-b.ts:8:1");
  });
});
