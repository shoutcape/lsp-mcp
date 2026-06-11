import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  DocumentSymbolEntry,
  DocumentSymbolsResult,
  SemanticProvider,
} from "../providers/semantic-provider.js";
import { textResult } from "./text-result.js";

function formatSymbol(sym: DocumentSymbolEntry, indent: string): string {
  const pos = `${sym.line}:${sym.column}-${sym.endLine}:${sym.endColumn}`;
  const lines = [`${indent}${sym.name} (${sym.kind}) ${pos}`];
  if (sym.children && sym.children.length > 0) {
    for (const child of sym.children) {
      lines.push(formatSymbol(child, `${indent}  `));
    }
  }
  return lines.join("\n");
}

export function formatDocumentSymbolsResult(
  file: string,
  result: DocumentSymbolsResult,
): string {
  if (result.symbols.length === 0) {
    return `No symbols found in ${file}`;
  }
  const lines = [`Symbols in ${file}:\n`];
  for (const sym of result.symbols) {
    lines.push(formatSymbol(sym, "  "));
  }
  return lines.join("\n");
}

export function createDocumentSymbolsTool(provider: SemanticProvider) {
  return async function documentSymbols(input: {
    file: string;
  }): Promise<CallToolResult> {
    const result = await provider.getDocumentSymbols(input.file);
    return textResult(formatDocumentSymbolsResult(input.file, result));
  };
}
