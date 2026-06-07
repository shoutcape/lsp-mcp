import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type {
  CapabilitiesInfo,
  SemanticProvider,
} from "../providers/semantic-provider.js";
import { StaticSemanticProvider } from "../providers/static-semantic-provider.js";
import { textResult } from "./text-result.js";

function formatLspState(lsp: CapabilitiesInfo["lsp"]): string {
  return lsp.replace("_", " ");
}

export function formatCapabilitiesText(capabilities: CapabilitiesInfo): string {
  return [
    `Status: ${capabilities.status}`,
    "Tool: capabilities",
    `Supported tools: ${capabilities.supportedTools.join(", ")}`,
    `LSP: ${formatLspState(capabilities.lsp)}`,
  ].join("\n");
}

export function createCapabilitiesTool(provider: SemanticProvider) {
  return async function getCapabilitiesResult(): Promise<CallToolResult> {
    return textResult(formatCapabilitiesText(await provider.getCapabilities()));
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
