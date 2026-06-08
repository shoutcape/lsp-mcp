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

export interface SemanticProvider {
  getHealth(request?: HealthRequest): Promise<HealthInfo>;
  getCapabilities(request?: CapabilitiesRequest): Promise<CapabilitiesInfo>;
  getDefinition(location: FileLocation): Promise<DefinitionResult>;
  getReferences(location: FileLocation): Promise<ReferencesResult>;
  getHover(location: FileLocation): Promise<HoverResult>;
  getDiagnostics(request: DiagnosticsRequest): Promise<DiagnosticsResult>;
}
