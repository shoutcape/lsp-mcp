import type {
  CapabilitiesInfo,
  CapabilitiesRequest,
  HealthInfo,
  HealthRequest,
  SemanticProvider,
} from "./semantic-provider.js";

export class StaticSemanticProvider implements SemanticProvider {
  async getHealth(_request: HealthRequest = {}): Promise<HealthInfo> {
    return {
      status: "not_started",
      message: "LSP sessions are not implemented in this scaffold.",
    };
  }

  async getCapabilities(
    _request: CapabilitiesRequest = {},
  ): Promise<CapabilitiesInfo> {
    return {
      status: "ready",
      supportedTools: ["health", "capabilities"],
      lsp: "not_implemented",
    };
  }
}
