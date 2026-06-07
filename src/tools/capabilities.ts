import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { textResult } from "./text-result.js";

export function getCapabilitiesText(): string {
  return [
    "Status: ready",
    "Tool: capabilities",
    "Supported tools: health, capabilities",
    "LSP: not implemented",
  ].join("\n");
}

export async function getCapabilitiesResult(): Promise<CallToolResult> {
  return textResult(getCapabilitiesText());
}
