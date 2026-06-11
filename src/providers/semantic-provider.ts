export type HealthStatus =
  | "not_started"
  | "starting"
  | "ready"
  | "degraded"
  | "failed";

export interface HealthInfo {
  status: HealthStatus;
  message: string;
  setupError?: SetupErrorInfo;
}

export interface HealthRequest {
  check?: boolean;
  file?: string;
}

export interface CapabilitiesRequest {
  check?: boolean;
  file?: string;
}

export interface SetupErrorInfo {
  message: string;
  command?: string;
  stderr?: string;
}

export interface CapabilitiesInfo {
  status: HealthStatus;
  supportedTools: string[];
  lsp: "not_implemented" | "implemented";
  serverCapabilities?: string[];
  setupError?: SetupErrorInfo;
}

export interface FileLocation {
  file: string;
  line: number;
  column: number;
}

export interface DefinitionEntry {
  file: string;
  line: number;
  column: number;
}

export interface DefinitionResult {
  definitions: DefinitionEntry[];
}

export type ReferenceKind =
  | "definition"
  | "import"
  | "type-import"
  | "export"
  | "jsx"
  | "jsx-attribute"
  | "call"
  | "spread"
  | "reference";

export interface ReferenceEntry {
  file: string;
  line: number;
  column: number;
  isDefinition: boolean;
  kind: ReferenceKind;
}

export interface ReferencesRequest extends FileLocation {
  verbose?: boolean;
}

export interface ReferencesResult {
  references: ReferenceEntry[];
  caveats?: string[]; // explicit gaps: degraded, any-typed, spread, cross-project, truncation
}

export interface HoverResult {
  content: string;
}

export interface DiagnosticEntry {
  file: string;
  line: number;
  column: number;
  severity: "error" | "warning" | "information" | "hint";
  message: string;
  code?: number | string;
}

export interface DiagnosticsResult {
  diagnostics: DiagnosticEntry[];
}

export interface DiagnosticsRequest {
  file?: string;
  files?: string[];
}

export interface RenameLocation {
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  prefixText?: string;
  suffixText?: string;
}

export interface RenameResult {
  canRename: boolean;
  displayName?: string;
  reason?: string;
  locations: RenameLocation[];
}

export interface RenameRequest extends FileLocation {
  newName: string;
}

export interface CallHierarchyItemInfo {
  name: string;
  kind: string;
  file: string;
  line: number;
  column: number;
  containerName?: string;
}

export interface IncomingCallInfo {
  from: CallHierarchyItemInfo;
}

export interface OutgoingCallInfo {
  to: CallHierarchyItemInfo;
}

export interface CallHierarchyResult {
  item: CallHierarchyItemInfo | null;
  incoming?: IncomingCallInfo[];
  outgoing?: OutgoingCallInfo[];
  caveats?: string[]; // explicit gaps: indirect-call hint when empty
}

export interface CallHierarchyRequest extends FileLocation {
  direction: "incoming" | "outgoing" | "both";
}

export interface TypeDefinitionResult {
  locations: DefinitionEntry[];
}

export interface ImplementationResult {
  locations: DefinitionEntry[];
}

export type SymbolKindName = string;

export interface DocumentSymbolEntry {
  name: string;
  kind: SymbolKindName;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  containerName?: string;
  children?: DocumentSymbolEntry[];
}

export interface DocumentSymbolsResult {
  symbols: DocumentSymbolEntry[];
}

export interface WorkspaceSymbolEntry {
  name: string;
  kind: SymbolKindName;
  file: string;
  line: number;
  column: number;
  containerName?: string;
}

export interface WorkspaceSymbolsRequest {
  query: string;
  limit?: number;
}

export interface WorkspaceSymbolsResult {
  symbols: WorkspaceSymbolEntry[];
  caveats?: string[];
}

export interface SignatureParameter {
  label: string;
  documentation?: string;
}

export interface SignatureInfo {
  label: string;
  documentation?: string;
  parameters: SignatureParameter[];
}

export interface SignatureHelpResult {
  signatures: SignatureInfo[];
  activeSignature: number;
  activeParameter: number;
}

export interface SemanticProvider {
  getHealth(request?: HealthRequest): Promise<HealthInfo>;
  getCapabilities(request?: CapabilitiesRequest): Promise<CapabilitiesInfo>;
  getDefinition(location: FileLocation): Promise<DefinitionResult>;
  getReferences(request: ReferencesRequest): Promise<ReferencesResult>;
  getHover(location: FileLocation): Promise<HoverResult>;
  getDiagnostics(request: DiagnosticsRequest): Promise<DiagnosticsResult>;
  getRename(request: RenameRequest): Promise<RenameResult>;
  getCallHierarchy(request: CallHierarchyRequest): Promise<CallHierarchyResult>;
  getTypeDefinition(location: FileLocation): Promise<TypeDefinitionResult>;
  getImplementation(location: FileLocation): Promise<ImplementationResult>;
  getDocumentSymbols(file: string): Promise<DocumentSymbolsResult>;
  getWorkspaceSymbols(request: WorkspaceSymbolsRequest): Promise<WorkspaceSymbolsResult>;
  getSignatureHelp(location: FileLocation): Promise<SignatureHelpResult>;
}
