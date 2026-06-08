import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  DiagnosticEntry,
  DiagnosticsRequest,
  DiagnosticsResult,
  SemanticProvider,
} from "../providers/semantic-provider.js";
import { textResult } from "./text-result.js";

export function formatDiagnosticsResult(result: DiagnosticsResult): string {
  if (result.diagnostics.length === 0) {
    return "No diagnostics found.";
  }

  const errors = result.diagnostics.filter(
    (d) => d.severity === "error",
  ).length;
  const warnings = result.diagnostics.filter(
    (d) => d.severity === "warning",
  ).length;

  const lines = [
    `Diagnostics: ${result.diagnostics.length} total (${errors} errors, ${warnings} warnings)\n`,
  ];

  const byFile = new Map<string, DiagnosticEntry[]>();
  for (const d of result.diagnostics) {
    const existing = byFile.get(d.file) ?? [];
    byFile.set(d.file, [...existing, d]);
  }

  for (const [file, diagnostics] of byFile) {
    lines.push(`  ${file}:`);
    for (const d of diagnostics) {
      const code = d.code !== undefined ? ` TS${d.code}` : "";
      const sev =
        d.severity === "error"
          ? "ERROR"
          : d.severity === "warning"
            ? "WARN"
            : d.severity.toUpperCase();
      lines.push(`    L${d.line}:${d.column} [${sev}${code}] ${d.message}`);
    }
  }

  return lines.join("\n");
}

export function createDiagnosticsTool(provider: SemanticProvider) {
  return async function getDiagnostics(
    input: DiagnosticsRequest,
  ): Promise<CallToolResult> {
    const result = await provider.getDiagnostics(input);
    return textResult(formatDiagnosticsResult(result));
  };
}
