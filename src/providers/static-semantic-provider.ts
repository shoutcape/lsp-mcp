import type {
  CallHierarchyResult,
  CapabilitiesInfo,
  CapabilitiesRequest,
  DefinitionResult,
  DiagnosticsResult,
  DocumentSymbolsResult,
  FileLocation,
  HealthInfo,
  HealthRequest,
  HoverResult,
  ImplementationResult,
  ReferencesRequest,
  ReferencesResult,
  RenameResult,
  SemanticProvider,
  SignatureHelpResult,
  TypeDefinitionResult,
  WorkspaceSymbolsRequest,
  WorkspaceSymbolsResult,
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

  async getReferences(
    _request: ReferencesRequest = { file: "", line: 1, column: 1 },
  ): Promise<ReferencesResult> {
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

  async getTypeDefinition(
    _location: FileLocation,
  ): Promise<TypeDefinitionResult> {
    return { locations: [] };
  }

  async getImplementation(
    _location: FileLocation,
  ): Promise<ImplementationResult> {
    return { locations: [] };
  }

  async getDocumentSymbols(_file: string): Promise<DocumentSymbolsResult> {
    return { symbols: [] };
  }

  async getWorkspaceSymbols(
    _request: WorkspaceSymbolsRequest,
  ): Promise<WorkspaceSymbolsResult> {
    return { symbols: [] };
  }

  async getSignatureHelp(
    _location: FileLocation,
  ): Promise<SignatureHelpResult> {
    return { signatures: [], activeSignature: 0, activeParameter: 0 };
  }
}
