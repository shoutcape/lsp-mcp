import { describe, expect, it } from "vitest";
import type {
  ReferenceEntry,
  ReferencesResult,
} from "../../src/providers/semantic-provider.js";
import { formatReferencesResult } from "../../src/tools/references.js";

const loc = { file: "/src/Button.tsx", line: 12, column: 14 };

function ref(
  file: string,
  line: number,
  column: number,
  kind: ReferenceEntry["kind"],
  isDefinition = false,
): ReferenceEntry {
  return { file, line, column, isDefinition, kind };
}

describe("formatReferencesResult - compact (default)", () => {
  it("shows total count and per-file kind breakdown", () => {
    const result: ReferencesResult = {
      references: [
        ref("/src/Button.tsx", 12, 14, "definition", true),
        ref("/src/Button.tsx", 45, 3, "call"),
        ref("/src/Button.tsx", 67, 12, "call"),
        ref("/src/ButtonGroup.tsx", 2, 10, "import"),
        ref("/src/ButtonGroup.tsx", 5, 7, "call"),
      ],
    };
    const text = formatReferencesResult(loc, result, { verbose: false });
    expect(text).toContain("5 references");
    expect(text).toContain("2 files");
    expect(text).toContain("/src/Button.tsx");
    expect(text).toContain("1 def");
    expect(text).toContain("2 call");
    expect(text).toContain("/src/ButtonGroup.tsx");
    expect(text).toContain("1 import");
    expect(text).not.toContain("L12:14"); // no positions in compact mode
  });

  it("shows no references message when empty", () => {
    const result: ReferencesResult = { references: [] };
    const text = formatReferencesResult(loc, result, { verbose: false });
    expect(text).toContain("No references");
  });
});

describe("formatReferencesResult - verbose", () => {
  it("shows per-file position list with kind tags", () => {
    const result: ReferencesResult = {
      references: [
        ref("/src/Button.tsx", 12, 14, "definition", true),
        ref("/src/Button.tsx", 45, 3, "call"),
        ref("/src/index.ts", 1, 10, "import"),
      ],
    };
    const text = formatReferencesResult(loc, result, { verbose: true });
    expect(text).toContain("L12:14");
    expect(text).toContain("[definition]");
    expect(text).toContain("L45:3");
    expect(text).toContain("[call]");
    expect(text).toContain("L1:10");
    expect(text).toContain("[import]");
  });

  it("truncates at limit and appends overflow message", () => {
    const refs = Array.from({ length: 10 }, (_, i) =>
      ref("/src/a.ts", i + 1, 1, "call"),
    );
    const result: ReferencesResult = { references: refs };
    const text = formatReferencesResult(loc, result, {
      verbose: true,
      limit: 5,
    });
    expect(text).toContain("... and 5 more");
    // only 5 positions shown
    const posLines = text.split("\n").filter((l) => l.trim().startsWith("L"));
    expect(posLines.length).toBe(5);
  });

  it("does not emit orphaned file headers when all refs in a file overflow limit", () => {
    const refs = [
      ...Array.from({ length: 5 }, (_, i) =>
        ref("/src/a.ts", i + 1, 1, "call"),
      ),
      ref("/src/b.ts", 1, 1, "call"),
      ref("/src/b.ts", 2, 1, "call"),
    ];
    const result: ReferencesResult = { references: refs };
    const text = formatReferencesResult(loc, result, {
      verbose: true,
      limit: 5,
    });
    // b.ts header should not appear since no refs from b.ts are shown
    expect(text).not.toContain("/src/b.ts:");
    expect(text).toContain("... and 2 more");
  });
});
