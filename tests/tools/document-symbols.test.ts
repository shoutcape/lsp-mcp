import { describe, expect, it } from "vitest";
import type { DocumentSymbolsResult } from "../../src/providers/semantic-provider.js";
import { formatDocumentSymbolsResult } from "../../src/tools/document-symbols.js";

describe("formatDocumentSymbolsResult", () => {
  const file = "/src/button.tsx";

  it("reports no symbols found", () => {
    const result: DocumentSymbolsResult = { symbols: [] };
    const text = formatDocumentSymbolsResult(file, result);
    expect(text).toContain("No symbols found");
    expect(text).toContain("/src/button.tsx");
  });

  it("formats flat symbols list", () => {
    const result: DocumentSymbolsResult = {
      symbols: [
        {
          name: "Button",
          kind: "function",
          line: 5,
          column: 1,
          endLine: 20,
          endColumn: 2,
        },
        {
          name: "ButtonProps",
          kind: "interface",
          line: 1,
          column: 1,
          endLine: 4,
          endColumn: 2,
        },
      ],
    };
    const text = formatDocumentSymbolsResult(file, result);
    expect(text).toContain("Button");
    expect(text).toContain("function");
    expect(text).toContain("5:1");
    expect(text).toContain("ButtonProps");
    expect(text).toContain("interface");
  });

  it("renders nested children with indentation", () => {
    const result: DocumentSymbolsResult = {
      symbols: [
        {
          name: "MyClass",
          kind: "class",
          line: 1,
          column: 1,
          endLine: 20,
          endColumn: 1,
          children: [
            {
              name: "constructor",
              kind: "constructor",
              line: 2,
              column: 3,
              endLine: 5,
              endColumn: 4,
            },
          ],
        },
      ],
    };
    const text = formatDocumentSymbolsResult(file, result);
    expect(text).toContain("MyClass");
    // child indented
    expect(text).toMatch(/\s+constructor/);
  });

  it("shows file header", () => {
    const result: DocumentSymbolsResult = {
      symbols: [
        {
          name: "x",
          kind: "variable",
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 5,
        },
      ],
    };
    const text = formatDocumentSymbolsResult(file, result);
    expect(text).toContain("/src/button.tsx");
  });
});
