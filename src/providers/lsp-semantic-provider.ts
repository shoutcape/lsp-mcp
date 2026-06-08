import { fileURLToPath, pathToFileURL } from "node:url";
import type { Hover, MarkupContent } from "vscode-languageserver-protocol";
import {
  requestDefinition,
  requestHover,
  requestReferences,
} from "../lsp/semantic-requests.js";
import type {
  EnsureSessionResult,
  LspSessionManager,
} from "../lsp/session-manager.js";
import type {
  CapabilitiesInfo,
  CapabilitiesRequest,
  DefinitionResult,
  DiagnosticsRequest,
  DiagnosticsResult,
  FileLocation,
  HealthInfo,
  HealthRequest,
  HoverResult,
  ReferencesResult,
  SemanticProvider,
  SetupErrorInfo,
} from "./semantic-provider.js";

const supportedTools = [
  "health",
  "capabilities",
  "goto_definition",
  "find_references",
  "hover",
  "diagnostics",
];

interface LspProviderSessionInfo {
  state: HealthInfo["status"];
  message: string;
  serverCapabilities: string[];
}

export interface LspProviderSessionManager {
  getSummary(): LspProviderSessionInfo;
  ensureSession(file: string): Promise<EnsureSessionResult>;
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

    return toHealthInfo((await this.manager.ensureSession(file)).info);
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

    return toCapabilitiesInfo((await this.manager.ensureSession(file)).info);
  }

  async getDefinition(location: FileLocation): Promise<DefinitionResult> {
    const { info, session } = await this.manager.ensureSession(location.file);
    if (info.state !== "ready") {
      throw new Error(`LSP session not ready: ${info.message}`);
    }

    const uri = pathToFileURL(location.file).toString();
    const position = {
      line: location.line - 1,
      character: location.column - 1,
    };
    const languageId = languageIdForFile(location.file);

    await session.prepareFile(location.file, languageId);

    const connection = session.getConnection();
    if (connection === undefined)
      throw new Error("LSP connection unavailable.");

    const result = await requestDefinition(connection, uri, position);
    if (result === null) return { definitions: [] };

    type AnyLoc = {
      uri?: string;
      targetUri?: string;
      range?: { start: { line: number; character: number } };
      targetRange?: { start: { line: number; character: number } };
      targetSelectionRange?: { start: { line: number; character: number } };
    };
    const locations = (Array.isArray(result) ? result : [result]) as AnyLoc[];
    return {
      definitions: locations.map((loc) => {
        const targetUri = (loc.targetUri ?? loc.uri) as string;
        const targetRange =
          loc.targetSelectionRange ?? loc.targetRange ?? loc.range;
        if (targetRange === undefined) {
          return { file: fileURLToPath(targetUri), line: 1, column: 1 };
        }
        return {
          file: fileURLToPath(targetUri),
          line: targetRange.start.line + 1,
          column: targetRange.start.character + 1,
        };
      }),
    };
  }

  async getReferences(location: FileLocation): Promise<ReferencesResult> {
    const { info, session } = await this.manager.ensureSession(location.file);
    if (info.state !== "ready") {
      throw new Error(`LSP session not ready: ${info.message}`);
    }

    const uri = pathToFileURL(location.file).toString();
    const position = {
      line: location.line - 1,
      character: location.column - 1,
    };

    await session.prepareFile(location.file, languageIdForFile(location.file));

    const connection = session.getConnection();
    if (connection === undefined)
      throw new Error("LSP connection unavailable.");

    const result = await requestReferences(connection, uri, position);
    if (result === null) return { references: [] };

    return {
      references: result.map((ref) => ({
        file: fileURLToPath(ref.uri),
        line: ref.range.start.line + 1,
        column: ref.range.start.character + 1,
        isDefinition: false,
        isWriteAccess: false,
      })),
    };
  }

  async getHover(location: FileLocation): Promise<HoverResult> {
    const { info, session } = await this.manager.ensureSession(location.file);
    if (info.state !== "ready") {
      throw new Error(`LSP session not ready: ${info.message}`);
    }

    const uri = pathToFileURL(location.file).toString();
    const position = {
      line: location.line - 1,
      character: location.column - 1,
    };

    await session.prepareFile(location.file, languageIdForFile(location.file));

    const connection = session.getConnection();
    if (connection === undefined)
      throw new Error("LSP connection unavailable.");

    const result = await requestHover(connection, uri, position);
    if (result === null) return { content: "" };

    const content = extractHoverContent(result.contents);
    return { content };
  }

  async getDiagnostics(
    request: DiagnosticsRequest,
  ): Promise<DiagnosticsResult> {
    const files: string[] = [];
    if (request.file) files.push(request.file);
    if (request.files) files.push(...request.files);
    if (files.length === 0) return { diagnostics: [] };

    const allDiagnostics: DiagnosticsResult["diagnostics"] = [];

    for (const file of files) {
      const { info, session } = await this.manager.ensureSession(file);
      if (info.state !== "ready") continue;

      const uri = pathToFileURL(file).toString();

      session.getDiagnosticsStore()?.clear();

      await session.prepareFile(file, languageIdForFile(file));

      const store = session.getDiagnosticsStore();
      if (store === undefined) continue;

      const diagnostics = await store.waitForDiagnostics(uri);

      for (const d of diagnostics) {
        allDiagnostics.push({
          file,
          line: d.range.start.line + 1,
          column: d.range.start.character + 1,
          severity: severityToString(d.severity),
          message: d.message,
          code:
            typeof d.code === "number" || typeof d.code === "string"
              ? d.code
              : undefined,
        });
      }
    }

    return { diagnostics: allDiagnostics };
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

function languageIdForFile(file: string): string {
  if (file.endsWith(".tsx")) return "typescriptreact";
  if (file.endsWith(".jsx")) return "javascriptreact";
  if (file.endsWith(".js") || file.endsWith(".mjs") || file.endsWith(".cjs"))
    return "javascript";
  return "typescript";
}

function extractHoverContent(contents: Hover["contents"]): string {
  if (typeof contents === "string") return contents;
  if ("kind" in contents) return (contents as MarkupContent).value;
  if (Array.isArray(contents)) {
    return contents
      .map((c) =>
        typeof c === "string"
          ? c
          : (c as { language: string; value: string }).value,
      )
      .join("\n");
  }
  return (contents as { language: string; value: string }).value ?? "";
}

function severityToString(
  severity: number | undefined,
): "error" | "warning" | "information" | "hint" {
  switch (severity) {
    case 1:
      return "error";
    case 2:
      return "warning";
    case 3:
      return "information";
    default:
      return "hint";
  }
}
