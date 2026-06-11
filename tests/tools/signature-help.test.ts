import { describe, expect, it } from "vitest";
import type {
  FileLocation,
  SignatureHelpResult,
} from "../../src/providers/semantic-provider.js";
import { formatSignatureHelpResult } from "../../src/tools/signature-help.js";

describe("formatSignatureHelpResult", () => {
  const location: FileLocation = { file: "/src/app.ts", line: 20, column: 18 };

  it("reports no signature when empty", () => {
    const result: SignatureHelpResult = {
      signatures: [],
      activeSignature: 0,
      activeParameter: 0,
    };
    const text = formatSignatureHelpResult(location, result);
    expect(text).toContain("No signature help");
    expect(text).toContain("/src/app.ts:20:18");
  });

  it("formats signature with active parameter", () => {
    const result: SignatureHelpResult = {
      signatures: [
        {
          label:
            "createServer(deps?: ServerDependencies, opts?: ServerOptions): McpServer",
          parameters: [
            { label: "deps?: ServerDependencies" },
            { label: "opts?: ServerOptions" },
          ],
        },
      ],
      activeSignature: 0,
      activeParameter: 1,
    };
    const text = formatSignatureHelpResult(location, result);
    expect(text).toContain("createServer");
    expect(text).toContain("deps?: ServerDependencies");
    expect(text).toContain("opts?: ServerOptions");
    expect(text).toContain("Active parameter");
    expect(text).toContain("1"); // active parameter index
  });

  it("formats location in header", () => {
    const result: SignatureHelpResult = {
      signatures: [
        { label: "fn(x: number): void", parameters: [{ label: "x: number" }] },
      ],
      activeSignature: 0,
      activeParameter: 0,
    };
    const text = formatSignatureHelpResult(location, result);
    expect(text).toContain("/src/app.ts:20:18");
  });

  it("lists multiple overload signatures", () => {
    const result: SignatureHelpResult = {
      signatures: [
        { label: "fn(x: number): void", parameters: [{ label: "x: number" }] },
        { label: "fn(x: string): void", parameters: [{ label: "x: string" }] },
      ],
      activeSignature: 0,
      activeParameter: 0,
    };
    const text = formatSignatureHelpResult(location, result);
    expect(text).toContain("fn(x: number)");
    expect(text).toContain("fn(x: string)");
  });
});
