export type HealthStatus =
  | "not_started"
  | "starting"
  | "ready"
  | "degraded"
  | "failed";

export interface HealthInfo {
  status: HealthStatus;
  message: string;
}

export interface CapabilitiesInfo {
  status: HealthStatus;
  supportedTools: string[];
  lsp: "not_implemented" | "implemented";
}

export interface SemanticProvider {
  getHealth(): Promise<HealthInfo>;
  getCapabilities(): Promise<CapabilitiesInfo>;
}
