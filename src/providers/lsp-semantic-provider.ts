import { readFile as fsReadFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Hover, MarkupContent } from "vscode-languageserver-protocol";
import {
  classifyReferences,
  type ReferenceKind,
} from "../languages/typescript/reference-classifier.js";
import {
  requestCallHierarchyIncoming,
  requestCallHierarchyOutgoing,
  requestDefinition,
  requestHover,
  requestPrepareCallHierarchy,
  requestPrepareRename,
  requestReferences,
  requestRename,
} from "../lsp/semantic-requests.js";
import type {
  EnsureSessionResult,
  LspSessionManager,
} from "../lsp/session-manager.js";
import type {
  CallHierarchyItemInfo,
  CallHierarchyRequest,
  CallHierarchyResult,
  CapabilitiesInfo,
  CapabilitiesRequest,
  DefinitionResult,
  DiagnosticsRequest,
  DiagnosticsResult,
  FileLocation,
  HealthInfo,
  HealthRequest,
  HoverResult,
  ReferencesRequest,
  ReferencesResult,
  RenameLocation,
  RenameRequest,
  RenameResult,
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
  "rename",
  "call_hierarchy",
];

const SYMBOL_KIND_NAMES: Record<number, string> = {
  1: "file",
  2: "module",
  3: "namespace",
  4: "package",
  5: "class",
  6: "method",
  7: "property",
  8: "field",
  9: "constructor",
  10: "enum",
  11: "interface",
  12: "function",
  13: "variable",
  14: "constant",
  15: "string",
  16: "number",
  17: "boolean",
  18: "array",
  19: "object",
  20: "key",
  21: "null",
  22: "enum-member",
  23: "struct",
  24: "event",
  25: "operator",
  26: "type-parameter",
};

function symbolKindName(kind: number): string {
  return SYMBOL_KIND_NAMES[kind] ?? "unknown";
}

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
  readFile?: (path: string) => Promise<string>; // injectable for tests
}

export class LspSemanticProvider implements SemanticProvider {
  private readonly manager: LspProviderSessionManager;
  private readonly setupError: SetupErrorInfo | undefined;
  private readonly readFile: (path: string) => Promise<string>;

  constructor(options: LspSemanticProviderOptions) {
    this.manager = options.manager;
    this.setupError = options.setupError;
    this.readFile = options.readFile ?? ((p) => fsReadFile(p, "utf8"));
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

  async getReferences(request: ReferencesRequest): Promise<ReferencesResult> {
    const { info, session } = await this.manager.ensureSession(request.file);
    if (info.state !== "ready") {
      throw new Error(`LSP session not ready: ${info.message}`);
    }

    const uri = pathToFileURL(request.file).toString();
    const position = {
      line: request.line - 1,
      character: request.column - 1,
    };

    await session.prepareFile(request.file, languageIdForFile(request.file));

    const connection = session.getConnection();
    if (connection === undefined) throw new Error("LSP connection unavailable.");

    // Run references and definition in parallel (same connection, same session)
    const [rawRefs, rawDef] = await Promise.all([
      requestReferences(connection, uri, position),
      requestDefinition(connection, uri, position),
    ]);

    if (rawRefs === null) return { references: [] };

    // Resolve definition position (if available) for isDefinition matching
    type AnyLoc = {
      uri?: string;
      targetUri?: string;
      range?: { start: { line: number; character: number } };
      targetSelectionRange?: { start: { line: number; character: number } };
      targetRange?: { start: { line: number; character: number } };
    };
    let defFile: string | undefined;
    let defLine: number | undefined;
    let defColumn: number | undefined;
    if (rawDef !== null) {
      const defs = (Array.isArray(rawDef) ? rawDef : [rawDef]) as AnyLoc[];
      const first = defs[0];
      if (first !== undefined) {
        const targetUri = (first.targetUri ?? first.uri) as string | undefined;
        const range = first.targetSelectionRange ?? first.targetRange ?? first.range;
        if (targetUri !== undefined && range !== undefined) {
          defFile = fileURLToPath(targetUri);
          defLine = range.start.line + 1;
          defColumn = range.start.character + 1;
        }
      }
    }

    // Group refs by file for batched classification
    const refsByFile = new Map<string, Array<{ line: number; column: number; idx: number }>>();
    const allRefs = rawRefs.map((ref, idx) => {
      const file = fileURLToPath(ref.uri);
      const entry = { line: ref.range.start.line + 1, column: ref.range.start.character + 1, idx };
      const existing = refsByFile.get(file) ?? [];
      refsByFile.set(file, [...existing, entry]);
      return { file, line: entry.line, column: entry.column };
    });

    // Classify per file (read each file once)
    const kindByIdx = new Map<number, ReferenceKind>();
    for (const [file, fileRefs] of refsByFile) {
      let lines: string[];
      try {
        const content = await this.readFile(file);
        lines = content.split("\n");
      } catch {
        // If file unreadable, fall back to "reference" for all refs in it
        for (const r of fileRefs) kindByIdx.set(r.idx, "reference");
        continue;
      }
      const classified = classifyReferences({
        lines,
        refs: fileRefs,
        definitionLine: file === defFile ? defLine : undefined,
        definitionColumn: file === defFile ? defColumn : undefined,
      });
      for (let i = 0; i < fileRefs.length; i++) {
        const r = fileRefs[i];
        const k = classified[i];
        if (r !== undefined && k !== undefined) kindByIdx.set(r.idx, k);
      }
    }

    return {
      references: allRefs.map((ref, idx) => ({
        file: ref.file,
        line: ref.line,
        column: ref.column,
        isDefinition: ref.file === defFile && ref.line === defLine && ref.column === defColumn,
        kind: kindByIdx.get(idx) ?? "reference",
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

      const store = session.getDiagnosticsStore();
      if (store === undefined) continue;

      const revisionBefore = store.getRevision(uri);
      const prepareResult = await session.prepareFile(
        file,
        languageIdForFile(file),
      );

      const diagnostics =
        prepareResult === "unchanged" && revisionBefore > 0
          ? store.getDiagnostics(uri)
          : prepareResult === "unchanged"
            ? await store.waitForDiagnostics(uri)
            : await store.waitForDiagnosticsAfter(uri, revisionBefore);

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

  async getRename(request: RenameRequest): Promise<RenameResult> {
    const { info, session } = await this.manager.ensureSession(request.file);
    if (info.state !== "ready") {
      throw new Error(`LSP session not ready: ${info.message}`);
    }

    const uri = pathToFileURL(request.file).toString();
    const position = {
      line: request.line - 1,
      character: request.column - 1,
    };
    const languageId = languageIdForFile(request.file);

    await session.prepareFile(request.file, languageId);

    const connection = session.getConnection();
    if (connection === undefined)
      throw new Error("LSP connection unavailable.");

    const prepared = await requestPrepareRename(connection, uri, position);
    if (prepared === null) {
      return {
        canRename: false,
        reason: "This symbol cannot be renamed.",
        locations: [],
      };
    }

    const displayName =
      prepared !== null &&
      typeof prepared === "object" &&
      "placeholder" in (prepared as object)
        ? String((prepared as { placeholder: string }).placeholder)
        : undefined;

    const edit = await requestRename(
      connection,
      uri,
      position,
      request.newName,
    );
    if (edit === null) {
      return {
        canRename: false,
        reason: "Rename returned no edits.",
        locations: [],
      };
    }

    const locations: RenameLocation[] = [];
    for (const [docUri, edits] of Object.entries(edit.changes ?? {})) {
      const file = fileURLToPath(docUri);
      for (const textEdit of edits) {
        locations.push({
          file,
          line: textEdit.range.start.line + 1,
          column: textEdit.range.start.character + 1,
          endLine: textEdit.range.end.line + 1,
          endColumn: textEdit.range.end.character + 1,
        });
      }
    }

    return { canRename: true, displayName, locations };
  }

  async getCallHierarchy(
    request: CallHierarchyRequest,
  ): Promise<CallHierarchyResult> {
    const { info, session } = await this.manager.ensureSession(request.file);
    if (info.state !== "ready") {
      throw new Error(`LSP session not ready: ${info.message}`);
    }

    const uri = pathToFileURL(request.file).toString();
    const position = {
      line: request.line - 1,
      character: request.column - 1,
    };

    await session.prepareFile(request.file, languageIdForFile(request.file));

    const connection = session.getConnection();
    if (connection === undefined)
      throw new Error("LSP connection unavailable.");

    const items = await requestPrepareCallHierarchy(connection, uri, position);
    if (!items || items.length === 0) {
      return { item: null };
    }

    const lspItem = items[0];
    const item: CallHierarchyItemInfo = {
      name: lspItem.name,
      kind: symbolKindName(lspItem.kind),
      file: fileURLToPath(lspItem.uri),
      line: lspItem.selectionRange.start.line + 1,
      column: lspItem.selectionRange.start.character + 1,
      containerName: lspItem.detail ?? undefined,
    };

    const result: CallHierarchyResult = { item };

    if (request.direction === "incoming" || request.direction === "both") {
      const incomingLsp = await requestCallHierarchyIncoming(
        connection,
        lspItem,
      );
      result.incoming = (incomingLsp ?? []).map((c) => ({
        from: {
          name: c.from.name,
          kind: symbolKindName(c.from.kind),
          file: fileURLToPath(c.from.uri),
          line: c.from.selectionRange.start.line + 1,
          column: c.from.selectionRange.start.character + 1,
          containerName: c.from.detail ?? undefined,
        },
      }));
    }

    if (request.direction === "outgoing" || request.direction === "both") {
      const outgoingLsp = await requestCallHierarchyOutgoing(
        connection,
        lspItem,
      );
      result.outgoing = (outgoingLsp ?? []).map((c) => ({
        to: {
          name: c.to.name,
          kind: symbolKindName(c.to.kind),
          file: fileURLToPath(c.to.uri),
          line: c.to.selectionRange.start.line + 1,
          column: c.to.selectionRange.start.character + 1,
          containerName: c.to.detail ?? undefined,
        },
      }));
    }

    return result;
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
