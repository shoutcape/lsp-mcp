import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  FileLocation,
  SemanticProvider,
  TypeDefinitionResult,
} from "../providers/semantic-provider.js";
import { textResult } from "./text-result.js";

export function formatTypeDefinitionResult(
  location: FileLocation,
  result: TypeDefinitionResult,
): string {
  if (result.locations.length === 0) {
    return `No type definition found at ${location.file}:${location.line}:${location.column}`;
  }
  const lines = [
    `Type definition(s) for symbol at ${location.file}:${location.line}:${location.column}:\n`,
  ];
  for (const loc of result.locations) {
    lines.push(`  ${loc.file}:${loc.line}:${loc.column}`);
  }
  return lines.join("\n");
}

export function createTypeDefinitionTool(provider: SemanticProvider) {
  return async function typeDefinition(
    input: FileLocation,
  ): Promise<CallToolResult> {
    const result = await provider.getTypeDefinition(input);
    return textResult(formatTypeDefinitionResult(input, result));
  };
}
