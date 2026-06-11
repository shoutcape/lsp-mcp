import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  FileLocation,
  SemanticProvider,
  SignatureHelpResult,
  SignatureInfo,
} from "../providers/semantic-provider.js";
import { textResult } from "./text-result.js";

export function formatSignatureHelpResult(
  location: FileLocation,
  result: SignatureHelpResult,
): string {
  if (result.signatures.length === 0) {
    return (
      `No signature help at ${location.file}:${location.line}:${location.column}` +
      " (cursor not inside a call argument list)"
    );
  }

  const lines = [
    `Signature help at ${location.file}:${location.line}:${location.column}:\n`,
  ];

  const active = result.signatures[result.activeSignature] as SignatureInfo | undefined;

  if (active !== undefined) {
    lines.push(`  ${active.label}`);
    if (active.documentation) {
      lines.push(`  ${active.documentation}`);
    }
    const activeParam = active.parameters[result.activeParameter];
    if (activeParam !== undefined) {
      lines.push(`  Active parameter: ${activeParam.label} (${result.activeParameter})`);
    } else {
      lines.push(`  Active parameter: ${result.activeParameter}`);
    }
    lines.push("");
    lines.push("  Parameters:");
    for (let i = 0; i < active.parameters.length; i++) {
      const param = active.parameters[i];
      if (param !== undefined) {
        lines.push(`    [${i}] ${param.label}`);
      }
    }
  }

  if (result.signatures.length > 1) {
    lines.push("");
    lines.push(`  Overloads (${result.signatures.length}):`);
    for (const sig of result.signatures) {
      lines.push(`    ${sig.label}`);
    }
  }

  return lines.join("\n");
}

export function createSignatureHelpTool(provider: SemanticProvider) {
  return async function signatureHelp(
    input: FileLocation,
  ): Promise<CallToolResult> {
    const result = await provider.getSignatureHelp(input);
    return textResult(formatSignatureHelpResult(input, result));
  };
}
