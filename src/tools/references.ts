import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  FileLocation,
  ReferenceEntry,
  ReferencesResult,
  SemanticProvider,
} from "../providers/semantic-provider.js";
import { textResult } from "./text-result.js";

export function formatReferencesResult(
  location: FileLocation,
  result: ReferencesResult,
): string {
  if (result.references.length === 0) {
    return `No references found for symbol at ${location.file}:${location.line}:${location.column}`;
  }
  const lines = [`References (${result.references.length} total):\n`];

  const byFile = new Map<string, ReferenceEntry[]>();
  for (const ref of result.references) {
    const existing = byFile.get(ref.file) ?? [];
    byFile.set(ref.file, [...existing, ref]);
  }

  for (const [file, refs] of byFile) {
    lines.push(`  ${file}:`);
    for (const ref of refs) {
      const flags = [
        ref.isDefinition ? "def" : null,
        ref.isWriteAccess ? "write" : "read",
      ]
        .filter(Boolean)
        .join(", ");
      lines.push(`    L${ref.line}:${ref.column} [${flags}]`);
    }
  }
  return lines.join("\n");
}

export function createReferencesTool(provider: SemanticProvider) {
  return async function findReferences(
    input: FileLocation,
  ): Promise<CallToolResult> {
    const result = await provider.getReferences(input);
    return textResult(formatReferencesResult(input, result));
  };
}
