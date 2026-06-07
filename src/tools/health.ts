import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type {
  HealthInfo,
  SemanticProvider,
} from "../providers/semantic-provider.js";
import { StaticSemanticProvider } from "../providers/static-semantic-provider.js";
import { textResult } from "./text-result.js";

export function formatHealthText(health: HealthInfo): string {
  return [
    `Status: ${health.status}`,
    "Tool: health",
    `Message: ${health.message}`,
  ].join("\n");
}

export function createHealthTool(provider: SemanticProvider) {
  return async function getHealthResult(): Promise<CallToolResult> {
    return textResult(formatHealthText(await provider.getHealth()));
  };
}

export function getHealthText(): string {
  return formatHealthText({
    status: "not_started",
    message: "LSP sessions are not implemented in this scaffold.",
  });
}

export const getHealthResult = createHealthTool(new StaticSemanticProvider());
