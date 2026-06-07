import type {
  CapabilitiesInfo,
  HealthInfo,
  SemanticProvider,
} from "./semantic-provider.js";

export class StaticSemanticProvider implements SemanticProvider {
  async getHealth(): Promise<HealthInfo> {
    return {
      status: "not_started",
      message: "LSP sessions are not implemented in this scaffold.",
    };
  }

  async getCapabilities(): Promise<CapabilitiesInfo> {
    return {
      status: "ready",
      supportedTools: ["health", "capabilities"],
      lsp: "not_implemented",
    };
  }
}
