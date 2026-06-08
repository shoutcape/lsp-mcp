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

export interface SemanticProvider {
  getHealth(request?: HealthRequest): Promise<HealthInfo>;
  getCapabilities(request?: CapabilitiesRequest): Promise<CapabilitiesInfo>;
}
