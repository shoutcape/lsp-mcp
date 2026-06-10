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

export interface ReferenceEntry {
  file: string;
  line: number;
  column: number;
  isDefinition: boolean;
  isWriteAccess: boolean;
}

export interface ReferencesResult {
  references: ReferenceEntry[];
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
}

export interface CallHierarchyRequest extends FileLocation {
  direction: "incoming" | "outgoing" | "both";
}

export interface SemanticProvider {
  getHealth(request?: HealthRequest): Promise<HealthInfo>;
  getCapabilities(request?: CapabilitiesRequest): Promise<CapabilitiesInfo>;
  getDefinition(location: FileLocation): Promise<DefinitionResult>;
  getReferences(location: FileLocation): Promise<ReferencesResult>;
  getHover(location: FileLocation): Promise<HoverResult>;
  getDiagnostics(request: DiagnosticsRequest): Promise<DiagnosticsResult>;
  getRename(request: RenameRequest): Promise<RenameResult>;
  getCallHierarchy(request: CallHierarchyRequest): Promise<CallHierarchyResult>;
}
