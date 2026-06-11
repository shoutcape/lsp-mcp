import { describe, expect, it } from "vitest";
import type {
  WorkspaceSymbolsRequest,
  WorkspaceSymbolsResult,
} from "../../src/providers/semantic-provider.js";
import { formatWorkspaceSymbolsResult } from "../../src/tools/workspace-symbols.js";

describe("formatWorkspaceSymbolsResult", () => {
  const request: WorkspaceSymbolsRequest = { query: "useAuth" };

  it("reports no symbols found", () => {
    const result: WorkspaceSymbolsResult = { symbols: [] };
    const text = formatWorkspaceSymbolsResult(request, result);
    expect(text).toContain("No workspace symbols found");
    expect(text).toContain("useAuth");
  });

  it("formats symbol entries", () => {
    const result: WorkspaceSymbolsResult = {
      symbols: [
        {
          name: "useAuth",
          kind: "function",
          file: "/src/hooks/auth.ts",
          line: 12,
          column: 1,
          containerName: "hooks",
        },
      ],
    };
    const text = formatWorkspaceSymbolsResult(request, result);
    expect(text).toContain("useAuth");
    expect(text).toContain("function");
    expect(text).toContain("/src/hooks/auth.ts:12:1");
    expect(text).toContain("Result: 1");
  });

  it("renders caveats block for truncation", () => {
    const result: WorkspaceSymbolsResult = {
      symbols: [
        { name: "x", kind: "variable", file: "/src/a.ts", line: 1, column: 1 },
      ],
      caveats: [
        "Results truncated at 50. Narrow query or increase limit for more precise results.",
      ],
    };
    const text = formatWorkspaceSymbolsResult(request, result);
    expect(text).toContain("caveats:");
    expect(text).toContain("truncated");
  });

  it("no caveats block when caveats absent", () => {
    const result: WorkspaceSymbolsResult = {
      symbols: [
        { name: "y", kind: "class", file: "/src/b.ts", line: 2, column: 1 },
      ],
    };
    const text = formatWorkspaceSymbolsResult(request, result);
    expect(text).not.toContain("caveats:");
  });
});
