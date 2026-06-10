import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  FileLocation,
  ReferenceEntry,
  ReferencesRequest,
  ReferencesResult,
  SemanticProvider,
} from "../providers/semantic-provider.js";
import { textResult } from "./text-result.js";

export interface FormatOptions {
  verbose?: boolean;
  limit?: number;
}

export function formatReferencesResult(
  location: FileLocation,
  result: ReferencesResult,
  options: FormatOptions = {},
): string {
  const { verbose = false, limit = 50 } = options;

  if (result.references.length === 0) {
    return `No references found for symbol at ${location.file}:${location.line}:${location.column}`;
  }

  // Group by file
  const byFile = new Map<string, ReferenceEntry[]>();
  for (const ref of result.references) {
    const existing = byFile.get(ref.file) ?? [];
    byFile.set(ref.file, [...existing, ref]);
  }

  if (!verbose) {
    // Compact: summary header + per-file kind breakdown
    const lines = [
      `References for symbol at ${location.file}:${location.line}:${location.column}\n`,
      `  ${result.references.length} references across ${byFile.size} ${byFile.size === 1 ? "file" : "files"}`,
    ];
    for (const [file, refs] of byFile) {
      const kindCounts = new Map<string, number>();
      for (const r of refs) {
        kindCounts.set(r.kind, (kindCounts.get(r.kind) ?? 0) + 1);
      }
      const breakdown = [...kindCounts.entries()]
        .map(([k, n]) => (k === "definition" ? `${n} def` : `${n} ${k}`))
        .join(", ");
      lines.push(`  ${file}: ${refs.length} (${breakdown})`);
    }
    return lines.join("\n");
  }

  // Verbose: per-file position list with kind tags, truncated at limit
  const header = `References (${result.references.length} total) for symbol at ${location.file}:${location.line}:${location.column}\n`;
  const lines: string[] = [header];

  let shown = 0;
  let overflow = 0;

  for (const [file, refs] of byFile) {
    if (shown >= limit) {
      overflow += refs.length;
      continue;
    }

    // Count how many from this file will actually be shown
    const willShow = Math.min(refs.length, limit - shown);
    if (willShow > 0) {
      lines.push(`  ${file}:`);
    }

    for (const ref of refs) {
      if (shown < limit) {
        lines.push(`    L${ref.line}:${ref.column}  [${ref.kind}]`);
        shown++;
      } else {
        overflow++;
      }
    }
  }

  if (overflow > 0) {
    lines.push(
      `  ... and ${overflow} more (use verbose:true with a higher limit)`,
    );
  }

  return lines.join("\n");
}

export function createReferencesTool(
  provider: SemanticProvider,
  options: { limit?: number } = {},
) {
  return async function findReferences(
    input: ReferencesRequest,
  ): Promise<CallToolResult> {
    const result = await provider.getReferences(input);
    return textResult(
      formatReferencesResult(input, result, {
        verbose: input.verbose ?? false,
        limit: options.limit,
      }),
    );
  };
}
