import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type {
  CapabilitiesInfo,
  CapabilitiesRequest,
  SemanticProvider,
} from "../providers/semantic-provider.js";
import { StaticSemanticProvider } from "../providers/static-semantic-provider.js";
import { textResult } from "./text-result.js";

export const capabilitiesToolInputSchema = {
  check: z.boolean().optional(),
  file: z.string().optional(),
};

function formatLspState(lsp: CapabilitiesInfo["lsp"]): string {
  return lsp.replace("_", " ");
}

export function formatCapabilitiesText(capabilities: CapabilitiesInfo): string {
  const lines = [
    `Status: ${capabilities.status}`,
    "Tool: capabilities",
    `Supported tools: ${capabilities.supportedTools.join(", ")}`,
    `LSP: ${formatLspState(capabilities.lsp)}`,
  ];

  if (capabilities.serverCapabilities?.length) {
    lines.push(
      `Server capabilities: ${capabilities.serverCapabilities.join(", ")}`,
    );
  }

  return lines.join("\n");
}

export function createCapabilitiesTool(provider: SemanticProvider) {
  return async function getCapabilitiesResult(
    request: CapabilitiesRequest = {},
  ): Promise<CallToolResult> {
    return textResult(
      formatCapabilitiesText(await provider.getCapabilities(request)),
    );
  };
}

export function getCapabilitiesText(): string {
  return formatCapabilitiesText({
    status: "ready",
    supportedTools: ["health", "capabilities"],
    lsp: "not_implemented",
  });
}

export const getCapabilitiesResult = createCapabilitiesTool(
  new StaticSemanticProvider(),
);
