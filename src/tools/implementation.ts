import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  FileLocation,
  ImplementationResult,
  SemanticProvider,
} from "../providers/semantic-provider.js";
import { textResult } from "./text-result.js";

export function formatImplementationResult(
  location: FileLocation,
  result: ImplementationResult,
): string {
  if (result.locations.length === 0) {
    return `No implementation found at ${location.file}:${location.line}:${location.column}`;
  }
  const lines = [
    `Implementation(s) for symbol at ${location.file}:${location.line}:${location.column}:\n`,
  ];
  for (const loc of result.locations) {
    lines.push(`  ${loc.file}:${loc.line}:${loc.column}`);
  }
  return lines.join("\n");
}

export function createImplementationTool(provider: SemanticProvider) {
  return async function implementation(
    input: FileLocation,
  ): Promise<CallToolResult> {
    const result = await provider.getImplementation(input);
    return textResult(formatImplementationResult(input, result));
  };
}
