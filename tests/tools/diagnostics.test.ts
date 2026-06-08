import { describe, expect, it } from "vitest";
import type { DiagnosticsResult } from "../../src/providers/semantic-provider.js";
import { formatDiagnosticsResult } from "../../src/tools/diagnostics.js";

describe("formatDiagnosticsResult", () => {
  it("formats diagnostics grouped by file with TS error code", () => {
    const result: DiagnosticsResult = {
      diagnostics: [
        {
          file: "/src/broken.ts",
          line: 1,
          column: 7,
          severity: "error",
          message: "Type 'string' is not assignable to type 'number'.",
          code: 2322,
        },
        {
          file: "/src/broken.ts",
          line: 2,
          column: 7,
          severity: "error",
          message: "Type 'number' is not assignable to type 'string'.",
          code: 2322,
        },
      ],
    };
    const text = formatDiagnosticsResult(result);
    expect(text).toContain("2 total");
    expect(text).toContain("2 errors");
    expect(text).toContain("TS2322");
    expect(text).toContain("/src/broken.ts:");
  });

  it("reports no diagnostics", () => {
    const result: DiagnosticsResult = { diagnostics: [] };
    const text = formatDiagnosticsResult(result);
    expect(text).toContain("No diagnostics");
  });

  it("shows severity breakdown", () => {
    const result: DiagnosticsResult = {
      diagnostics: [
        {
          file: "/a.ts",
          line: 1,
          column: 1,
          severity: "error",
          message: "err",
        },
        {
          file: "/a.ts",
          line: 2,
          column: 1,
          severity: "warning",
          message: "warn",
        },
      ],
    };
    const text = formatDiagnosticsResult(result);
    expect(text).toContain("1 errors");
    expect(text).toContain("1 warnings");
  });
});
