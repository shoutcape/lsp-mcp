import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  DefinitionResult,
  FileLocation,
  SemanticProvider,
} from "../providers/semantic-provider.js";
import { textResult } from "./text-result.js";

export function formatDefinitionResult(
  location: FileLocation,
  result: DefinitionResult,
): string {
  if (result.definitions.length === 0) {
    return `No definition found at ${location.file}:${location.line}:${location.column}`;
  }
  const lines = [
    `Definition(s) for symbol at ${location.file}:${location.line}:${location.column}:\n`,
  ];
  for (const def of result.definitions) {
    lines.push(`  ${def.file}:${def.line}:${def.column}`);
  }
  return lines.join("\n");
}

export function createDefinitionTool(provider: SemanticProvider) {
  return async function gotoDefinition(
    input: FileLocation,
  ): Promise<CallToolResult> {
    const result = await provider.getDefinition(input);
    return textResult(formatDefinitionResult(input, result));
  };
}
