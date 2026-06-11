import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  SemanticProvider,
  WorkspaceSymbolsRequest,
  WorkspaceSymbolsResult,
} from "../providers/semantic-provider.js";
import { textResult } from "./text-result.js";

function renderCaveats(caveats: string[] | undefined): string {
  if (!caveats || caveats.length === 0) return "";
  const lines = ["\n  caveats:"];
  for (const c of caveats) {
    lines.push(`  - ${c}`);
  }
  return lines.join("\n");
}

export function formatWorkspaceSymbolsResult(
  request: WorkspaceSymbolsRequest,
  result: WorkspaceSymbolsResult,
): string {
  if (result.symbols.length === 0) {
    return (
      `No workspace symbols found for "${request.query}"` +
      renderCaveats(result.caveats)
    );
  }

  const lines = [`Workspace symbols for "${request.query}":\n`];
  for (const sym of result.symbols) {
    const container = sym.containerName ? ` (in ${sym.containerName})` : "";
    lines.push(
      `  ${sym.name}${container} [${sym.kind}] ${sym.file}:${sym.line}:${sym.column}`,
    );
  }
  lines.push("");
  lines.push(
    `Result: ${result.symbols.length} symbol${result.symbols.length === 1 ? "" : "s"}`,
  );

  return lines.join("\n") + renderCaveats(result.caveats);
}

export function createWorkspaceSymbolsTool(provider: SemanticProvider) {
  return async function workspaceSymbols(
    input: WorkspaceSymbolsRequest,
  ): Promise<CallToolResult> {
    const result = await provider.getWorkspaceSymbols(input);
    return textResult(formatWorkspaceSymbolsResult(input, result));
  };
}
