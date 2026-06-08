import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type {
  HealthInfo,
  HealthRequest,
  SemanticProvider,
} from "../providers/semantic-provider.js";
import { StaticSemanticProvider } from "../providers/static-semantic-provider.js";
import { textResult } from "./text-result.js";

export const healthToolInputSchema = {
  check: z.boolean().optional(),
  file: z.string().optional(),
};

export function formatHealthText(health: HealthInfo): string {
  return [
    `Status: ${health.status}`,
    "Tool: health",
    `Message: ${health.message}`,
  ].join("\n");
}

export function createHealthTool(provider: SemanticProvider) {
  return async function getHealthResult(
    request: HealthRequest = {},
  ): Promise<CallToolResult> {
    return textResult(formatHealthText(await provider.getHealth(request)));
  };
}

export function getHealthText(): string {
  return formatHealthText({
    status: "not_started",
    message: "LSP sessions are not implemented in this scaffold.",
  });
}

export const getHealthResult = createHealthTool(new StaticSemanticProvider());
