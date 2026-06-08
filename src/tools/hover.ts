import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  FileLocation,
  HoverResult,
  SemanticProvider,
} from "../providers/semantic-provider.js";
import { textResult } from "./text-result.js";

export function formatHoverResult(
  location: FileLocation,
  result: HoverResult,
): string {
  if (!result.content) {
    return `No type information at ${location.file}:${location.line}:${location.column}`;
  }
  const lines = [
    `Type info at ${location.file}:${location.line}:${location.column}:\n`,
  ];
  lines.push(`  ${result.content}`);
  return lines.join("\n");
}

export function createHoverTool(provider: SemanticProvider) {
  return async function getHover(input: FileLocation): Promise<CallToolResult> {
    const result = await provider.getHover(input);
    return textResult(formatHoverResult(input, result));
  };
}
