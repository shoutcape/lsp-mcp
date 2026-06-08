import type { ServerCapabilities } from "vscode-languageserver-protocol";

export type LspSessionState = "not_started" | "starting" | "ready" | "failed";

export interface LspProcess {
  pid?: number;
  on(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): this;
  on(event: "error", listener: (error: Error) => void): this;
  once(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): this;
  once(event: "error", listener: (error: Error) => void): this;
  kill(): boolean;
}

export interface LspConnection {
  listen(): void;
  sendRequest(method: unknown, params: unknown): Promise<unknown>;
  sendNotification(method: unknown, params?: unknown): Promise<void>;
  onNotification(method: unknown, handler: (params: unknown) => void): void;
  dispose(): void;
}

export interface LspConnectionFactoryOptions {
  command: string;
  args: string[];
  cwd: string;
}

export interface LspConnectionFactoryResult {
  process: LspProcess;
  connection: LspConnection;
}

export type LspConnectionFactory = (
  options: LspConnectionFactoryOptions,
) => Promise<LspConnectionFactoryResult>;

export interface LspSessionInfo {
  state: LspSessionState;
  message: string;
  projectAnchor: string;
  rootPath: string;
  serverCapabilities: string[];
  rawServerCapabilities?: ServerCapabilities;
}
