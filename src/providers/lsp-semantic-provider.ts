import type { LspSessionManager } from "../lsp/session-manager.js";
import type {
  CapabilitiesInfo,
  CapabilitiesRequest,
  HealthInfo,
  HealthRequest,
  SemanticProvider,
  SetupErrorInfo,
} from "./semantic-provider.js";

const supportedTools = ["health", "capabilities"];

interface LspProviderSessionInfo {
  state: HealthInfo["status"];
  message: string;
  serverCapabilities: string[];
}

export interface LspProviderSessionManager {
  getSummary(): LspProviderSessionInfo;
  ensureSession(file: string): Promise<LspProviderSessionInfo>;
}

export interface LspSemanticProviderOptions {
  manager: LspProviderSessionManager | LspSessionManager;
  setupError?: SetupErrorInfo;
}

export class LspSemanticProvider implements SemanticProvider {
  private readonly manager: LspProviderSessionManager;
  private readonly setupError: SetupErrorInfo | undefined;

  constructor(options: LspSemanticProviderOptions) {
    this.manager = options.manager;
    this.setupError = options.setupError;
  }

  async getHealth(request: HealthRequest = {}): Promise<HealthInfo> {
    if (this.setupError !== undefined) {
      const setupError = cloneSetupError(this.setupError);
      return {
        status: "failed",
        message: setupError.message,
        setupError,
      };
    }

    if (!request.check) {
      return toHealthInfo(this.manager.getSummary());
    }

    const file = request.file?.trim();
    if (!file) {
      return {
        status: "failed",
        message: "Active TypeScript LSP checks require a file path.",
      };
    }

    return toHealthInfo(await this.manager.ensureSession(file));
  }

  async getCapabilities(
    request: CapabilitiesRequest = {},
  ): Promise<CapabilitiesInfo> {
    if (this.setupError !== undefined) {
      return {
        status: "failed",
        supportedTools: [...supportedTools],
        lsp: "implemented",
      };
    }

    if (!request.check) {
      return toCapabilitiesInfo(this.manager.getSummary());
    }

    const file = request.file?.trim();
    if (!file) {
      return {
        status: "failed",
        supportedTools: [...supportedTools],
        lsp: "implemented",
      };
    }

    return toCapabilitiesInfo(await this.manager.ensureSession(file));
  }
}

function cloneSetupError(setupError: SetupErrorInfo): SetupErrorInfo {
  return { ...setupError };
}

function toHealthInfo(info: LspProviderSessionInfo): HealthInfo {
  return {
    status: info.state,
    message: info.message,
  };
}

function toCapabilitiesInfo(info: LspProviderSessionInfo): CapabilitiesInfo {
  return {
    status: info.state,
    supportedTools: [...supportedTools],
    lsp: "implemented",
    serverCapabilities: [...info.serverCapabilities],
  };
}
