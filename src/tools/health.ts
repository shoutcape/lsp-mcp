import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { textResult } from "./text-result.js";

export function getHealthText(): string {
  return [
    "Status: not_started",
    "Tool: health",
    "Message: LSP sessions are not implemented in this scaffold.",
  ].join("\n");
}

export async function getHealthResult(): Promise<CallToolResult> {
  return textResult(getHealthText());
}
