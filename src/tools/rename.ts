import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  RenameRequest,
  RenameResult,
  SemanticProvider,
} from "../providers/semantic-provider.js";
import { textResult } from "./text-result.js";

export function formatRenameResult(
  request: RenameRequest,
  result: RenameResult,
): string {
  if (!result.canRename) {
    return (
      `Cannot rename symbol at ${request.file}:${request.line}:${request.column}: ` +
      (result.reason ?? "unknown reason")
    );
  }

  const totalLocs = result.locations.length;
  const fileCount = new Set(result.locations.map((l) => l.file)).size;
  const displayName = result.displayName ?? "symbol";

  const lines = [
    `Rename "${displayName}" -> "${request.newName}"`,
    `${totalLocs} location(s) across ${fileCount} file(s):\n`,
  ];

  const byFile = new Map<string, typeof result.locations>();
  for (const loc of result.locations) {
    const existing = byFile.get(loc.file) ?? [];
    byFile.set(loc.file, [...existing, loc]);
  }

  for (const [file, locs] of byFile) {
    lines.push(`  ${file}:`);
    for (const loc of locs) {
      const range = `L${loc.line}:${loc.column}-L${loc.endLine}:${loc.endColumn}`;
      const extras =
        loc.prefixText || loc.suffixText
          ? ` (prefix: "${loc.prefixText ?? ""}", suffix: "${loc.suffixText ?? ""}")`
          : "";
      lines.push(`    ${range}${extras}`);
    }
  }

  lines.push(
    `\nApply: Replace the old name with "${request.newName}" at each location above.`,
  );
  return lines.join("\n");
}

export function createRenameTool(provider: SemanticProvider) {
  return async function rename(input: RenameRequest): Promise<CallToolResult> {
    const result = await provider.getRename(input);
    return textResult(formatRenameResult(input, result));
  };
}
