import type {
  CallHierarchyRequest,
  CallHierarchyResult,
  CapabilitiesInfo,
  CapabilitiesRequest,
  DefinitionResult,
  DiagnosticsResult,
  HealthInfo,
  HealthRequest,
  HoverResult,
  ReferencesResult,
  RenameRequest,
  RenameResult,
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

  async getDefinition(): Promise<DefinitionResult> {
    return { definitions: [] };
  }

  async getReferences(): Promise<ReferencesResult> {
    return { references: [] };
  }

  async getHover(): Promise<HoverResult> {
    return { content: "" };
  }

  async getDiagnostics(): Promise<DiagnosticsResult> {
    return { diagnostics: [] };
  }

  async getRename(): Promise<RenameResult> {
    return { canRename: false, reason: "Not implemented.", locations: [] };
  }

  async getCallHierarchy(): Promise<CallHierarchyResult> {
    return { item: null };
  }
}
