import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node.js";
import {
  type InitializeResult,
  PublishDiagnosticsNotification,
  type ServerCapabilities,
} from "vscode-languageserver-protocol";
import { DiagnosticsStore } from "./diagnostics-store.js";
import { DocumentSync, type PrepareFileResult } from "./document-sync.js";

import type {
  LspConnection,
  LspConnectionFactory,
  LspConnectionFactoryResult,
  LspProcess,
  LspSessionInfo,
} from "./types.js";

export interface LspSessionOptions {
  command: string[];
  projectAnchor: string;
  rootPath: string;
  connectionFactory?: LspConnectionFactory;
  initializeTimeoutMs?: number;
}

const defaultInitializeTimeoutMs = 30_000;

export class LspSession {
  private readonly command: string[];
  private readonly projectAnchor: string;
  private readonly rootPath: string;
  private readonly connectionFactory: LspConnectionFactory;
  private readonly initializeTimeoutMs: number;
  private info: LspSessionInfo;
  private initializePromise: Promise<LspSessionInfo> | undefined;
  private activeConnection: LspConnection | undefined;
  private activeProcess: LspProcess | undefined;
  private documentSync: DocumentSync | undefined;
  private diagnosticsStore: DiagnosticsStore | undefined;

  constructor(options: LspSessionOptions) {
    this.command = [...options.command];
    this.projectAnchor = options.projectAnchor;
    this.rootPath = options.rootPath;
    this.connectionFactory =
      options.connectionFactory ?? createNodeLspConnection;
    this.initializeTimeoutMs =
      options.initializeTimeoutMs ?? defaultInitializeTimeoutMs;
    this.info = {
      state: "not_started",
      message: "TypeScript LSP not started.",
      projectAnchor: this.projectAnchor,
      rootPath: this.rootPath,
      serverCapabilities: [],
    };
  }

  getInfo(): LspSessionInfo {
    return cloneInfo(this.info);
  }

  getConnection(): LspConnection | undefined {
    return this.activeConnection;
  }

  getDocumentSync(): DocumentSync | undefined {
    return this.documentSync;
  }

  getDiagnosticsStore(): DiagnosticsStore | undefined {
    return this.diagnosticsStore;
  }

  stop(): void {
    cleanupLspProcess(this.activeConnection, this.activeProcess);
    this.activeConnection = undefined;
    this.activeProcess = undefined;
    this.documentSync = undefined;
    this.diagnosticsStore?.clear();
    this.diagnosticsStore = undefined;
  }

  async prepareFile(
    filePath: string,
    languageId: string,
  ): Promise<PrepareFileResult> {
    if (this.documentSync === undefined) {
      throw new Error("LSP session is not ready.");
    }
    return this.documentSync.prepareFile(filePath, languageId);
  }

  async initialize(): Promise<LspSessionInfo> {
    if (this.info.state === "ready" || this.info.state === "failed") {
      return this.getInfo();
    }

    if (this.initializePromise !== undefined) {
      return this.initializePromise;
    }

    this.initializePromise = this.initializeOnce();
    return this.initializePromise;
  }

  private async initializeOnce(): Promise<LspSessionInfo> {
    const [command, ...args] = this.command;
    if (command === undefined || command.length === 0) {
      return this.markFailed("language server command is empty.");
    }

    this.info = {
      state: "starting",
      message: "TypeScript LSP starting.",
      projectAnchor: this.projectAnchor,
      rootPath: this.rootPath,
      serverCapabilities: [],
    };

    let process: LspProcess | undefined;
    let connection: LspConnection | undefined;

    try {
      const factoryResult = await this.connectionFactory({
        command,
        args,
        cwd: this.projectAnchor,
      });
      process = factoryResult.process;
      connection = factoryResult.connection;
      this.activeProcess = process;
      this.registerExitHandler(process);
      connection.listen();

      let timeout: NodeJS.Timeout | undefined;
      try {
        const initializeResult = (await Promise.race([
          this.performInitializeHandshake(connection, process),
          rejectOnProcessError(process),
          rejectOnInitializeTimeout(this.initializeTimeoutMs, (timer) => {
            timeout = timer;
          }),
        ])) as InitializeResult;

        const rawServerCapabilities = initializeResult.capabilities;
        this.info = {
          state: "ready",
          message: "TypeScript LSP initialized.",
          projectAnchor: this.projectAnchor,
          rootPath: this.rootPath,
          serverCapabilities: summarizeServerCapabilities(
            rawServerCapabilities,
          ),
          rawServerCapabilities,
        };
        this.activeConnection = connection;
        this.diagnosticsStore = new DiagnosticsStore();
        this.documentSync = new DocumentSync(connection);
        connection.onNotification(
          PublishDiagnosticsNotification.type,
          (params) => {
            this.diagnosticsStore?.onDiagnostics(
              params as Parameters<DiagnosticsStore["onDiagnostics"]>[0],
            );
          },
        );
      } finally {
        if (timeout !== undefined) {
          clearTimeout(timeout);
        }
      }

      return this.getInfo();
    } catch (error) {
      cleanupLspProcess(connection, process);
      return this.markFailed(errorMessage(error));
    }
  }

  private registerExitHandler(process: LspProcess): void {
    process.on("exit", (code, signal) => {
      if (this.info.state === "failed") {
        return;
      }

      this.info = {
        state: "failed",
        message: `TypeScript LSP exited with code ${code ?? "null"} and signal ${signal ?? "null"}.`,
        projectAnchor: this.projectAnchor,
        rootPath: this.rootPath,
        serverCapabilities: [],
      };
      this.activeConnection = undefined;
      this.documentSync = undefined;
      this.diagnosticsStore?.clear();
      this.diagnosticsStore = undefined;
    });
  }

  private markFailed(reason: string): LspSessionInfo {
    this.info = {
      state: "failed",
      message: `Unable to initialize TypeScript LSP: ${reason}`,
      projectAnchor: this.projectAnchor,
      rootPath: this.rootPath,
      serverCapabilities: [],
    };
    this.activeConnection = undefined;
    this.documentSync = undefined;
    this.diagnosticsStore?.clear();
    this.diagnosticsStore = undefined;

    return this.getInfo();
  }

  private async performInitializeHandshake(
    connection: LspConnection,
    process: LspProcess,
  ): Promise<InitializeResult> {
    const initializeResult = (await connection.sendRequest("initialize", {
      processId: process.pid ?? null,
      rootPath: this.rootPath,
      rootUri: pathToFileURL(this.projectAnchor).toString(),
      workspaceFolders: [
        {
          name: workspaceFolderName(this.rootPath),
          uri: pathToFileURL(this.rootPath).toString(),
        },
      ],
      capabilities: {
        textDocument: {
          publishDiagnostics: {
            relatedInformation: true,
            versionSupport: false,
            tagSupport: { valueSet: [1, 2] },
            codeDescriptionSupport: true,
            dataSupport: true,
          },
          synchronization: {
            dynamicRegistration: true,
            willSave: false,
            willSaveWaitUntil: false,
            didSave: false,
          },
        },
      },
    })) as InitializeResult;

    await connection.sendNotification("initialized", {});

    return initializeResult;
  }
}

export async function createNodeLspConnection({
  command,
  args,
  cwd,
}: Parameters<LspConnectionFactory>[0]): Promise<LspConnectionFactoryResult> {
  const child = spawn(command, args, {
    cwd,
    stdio: ["pipe", "pipe", "ignore"],
  });

  if (child.stdout === null || child.stdin === null) {
    child.kill();
    throw new Error("language server stdio streams are unavailable.");
  }

  const connection = createMessageConnection(
    new StreamMessageReader(child.stdout),
    new StreamMessageWriter(child.stdin),
  );

  return {
    process: child,
    connection: {
      listen() {
        connection.listen();
      },
      sendRequest(method, params) {
        const methodStr =
          typeof method === "string"
            ? method
            : (method as { method: string }).method;
        const sendRequest = connection.sendRequest as (
          method: string,
          params: unknown,
        ) => Promise<unknown>;
        return sendRequest(methodStr, params);
      },
      sendNotification(method, params) {
        const methodStr =
          typeof method === "string"
            ? method
            : (method as { method: string }).method;
        const sendNotification = connection.sendNotification as (
          method: string,
          params?: unknown,
        ) => Promise<void>;
        return sendNotification(methodStr, params);
      },
      onNotification(method, handler) {
        const methodStr =
          typeof method === "string"
            ? method
            : (method as { method: string }).method;
        const onNotification = connection.onNotification as (
          method: string,
          handler: (params: unknown) => void,
        ) => void;
        onNotification(methodStr, handler);
      },
      dispose() {
        connection.dispose();
      },
    },
  };
}

export function summarizeServerCapabilities(
  capabilities: ServerCapabilities,
): string[] {
  return Object.entries(capabilities)
    .filter(
      ([, value]) => value !== undefined && value !== false && value !== 0,
    )
    .map(([name]) => name)
    .sort();
}

function rejectOnProcessError(process: LspProcess): Promise<never> {
  return new Promise((_, reject) => {
    process.once("error", reject);
  });
}

function rejectOnInitializeTimeout(
  timeoutMs: number,
  storeTimer: (timer: NodeJS.Timeout) => void,
): Promise<never> {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("initialize timed out."));
    }, timeoutMs);
    storeTimer(timer);
  });
}

function cleanupLspProcess(
  connection: LspConnection | undefined,
  process: LspProcess | undefined,
): void {
  connection?.dispose();
  process?.kill();
}

function workspaceFolderName(rootPath: string): string {
  return path.basename(rootPath) || rootPath;
}

function cloneInfo(info: LspSessionInfo): LspSessionInfo {
  const clone: LspSessionInfo = {
    state: info.state,
    message: info.message,
    projectAnchor: info.projectAnchor,
    rootPath: info.rootPath,
    serverCapabilities: [...info.serverCapabilities],
  };

  if (info.rawServerCapabilities !== undefined) {
    clone.rawServerCapabilities = structuredClone(info.rawServerCapabilities);
  }

  return clone;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
