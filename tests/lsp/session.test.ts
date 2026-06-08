import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

import { beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());
const messageConnectionMock = vi.hoisted(() => ({
  listen: vi.fn(),
  sendRequest: vi.fn(),
  sendNotification: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

vi.mock("vscode-jsonrpc/node.js", () => ({
  createMessageConnection: vi.fn(() => messageConnectionMock),
  StreamMessageReader: vi.fn(),
  StreamMessageWriter: vi.fn(),
}));

import {
  createNodeLspConnection,
  LspSession,
  summarizeServerCapabilities,
} from "../../src/lsp/session.js";
import type { LspConnection, LspProcess } from "../../src/lsp/types.js";

function createMockConnection(): LspConnection {
  return {
    listen: vi.fn(),
    sendRequest: vi.fn().mockResolvedValue({
      capabilities: {
        definitionProvider: true,
        hoverProvider: true,
        textDocumentSync: 1,
      },
    }),
    sendNotification: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  };
}

function createMockProcess(): LspProcess {
  const process = new EventEmitter() as LspProcess;
  process.pid = 1234;
  process.kill = vi.fn().mockReturnValue(true);
  return process;
}

describe("LspSession", () => {
  beforeEach(() => {
    spawnMock.mockReset();
    messageConnectionMock.listen.mockReset();
    messageConnectionMock.sendRequest.mockReset();
    messageConnectionMock.sendNotification.mockReset();
    messageConnectionMock.dispose.mockReset();
  });

  it("initializes an LSP connection and stores capability names", async () => {
    const connection = createMockConnection();
    const process = createMockProcess();
    const factory = vi.fn().mockResolvedValue({ process, connection });
    const session = new LspSession({
      command: ["typescript-language-server", "--stdio"],
      projectAnchor: "/workspace/app",
      rootPath: "/workspace",
      connectionFactory: factory,
    });

    const info = await session.initialize();

    expect(info).toMatchObject({
      state: "ready",
      message: "TypeScript LSP initialized.",
      projectAnchor: "/workspace/app",
      rootPath: "/workspace",
      serverCapabilities: [
        "definitionProvider",
        "hoverProvider",
        "textDocumentSync",
      ],
    });
    expect(info.rawServerCapabilities).toEqual({
      definitionProvider: true,
      hoverProvider: true,
      textDocumentSync: 1,
    });
    expect(factory).toHaveBeenCalledWith({
      command: "typescript-language-server",
      args: ["--stdio"],
      cwd: "/workspace/app",
    });
    expect(connection.listen).toHaveBeenCalledTimes(1);
    expect(connection.sendRequest).toHaveBeenCalledWith(expect.anything(), {
      processId: 1234,
      rootPath: "/workspace",
      rootUri: "file:///workspace/app",
      workspaceFolders: [
        {
          name: "workspace",
          uri: "file:///workspace",
        },
      ],
      capabilities: {},
    });
    expect(connection.sendNotification).toHaveBeenCalledTimes(1);
  });

  it("fails without spawning when command is empty", async () => {
    const factory = vi.fn();
    const session = new LspSession({
      command: [],
      projectAnchor: "/workspace/app",
      rootPath: "/workspace",
      connectionFactory: factory,
    });

    await expect(session.initialize()).resolves.toEqual({
      state: "failed",
      message:
        "Unable to initialize TypeScript LSP: language server command is empty.",
      projectAnchor: "/workspace/app",
      rootPath: "/workspace",
      serverCapabilities: [],
    });
    expect(factory).not.toHaveBeenCalled();
  });

  it("records initialize failures", async () => {
    const connection = createMockConnection();
    const process = createMockProcess();
    vi.mocked(connection.sendRequest).mockRejectedValue(
      new Error("initialize failed"),
    );
    const factory = vi.fn().mockResolvedValue({ process, connection });
    const session = new LspSession({
      command: ["typescript-language-server", "--stdio"],
      projectAnchor: "/workspace/app",
      rootPath: "/workspace",
      connectionFactory: factory,
    });

    await expect(session.initialize()).resolves.toEqual({
      state: "failed",
      message: "Unable to initialize TypeScript LSP: initialize failed",
      projectAnchor: "/workspace/app",
      rootPath: "/workspace",
      serverCapabilities: [],
    });
    expect(connection.dispose).toHaveBeenCalledTimes(1);
    expect(process.kill).toHaveBeenCalledTimes(1);
  });

  it("does not retry failed sessions", async () => {
    const connection = createMockConnection();
    const process = createMockProcess();
    vi.mocked(connection.sendRequest).mockRejectedValue(
      new Error("initialize failed"),
    );
    const factory = vi.fn().mockResolvedValue({ process, connection });
    const session = new LspSession({
      command: ["typescript-language-server", "--stdio"],
      projectAnchor: "/workspace/app",
      rootPath: "/workspace",
      connectionFactory: factory,
    });

    await session.initialize();
    await session.initialize();

    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("shares an in-flight initialization", async () => {
    const connection = createMockConnection();
    const process = createMockProcess();
    const factory = vi.fn().mockResolvedValue({ process, connection });
    const session = new LspSession({
      command: ["typescript-language-server", "--stdio"],
      projectAnchor: "/workspace/app",
      rootPath: "/workspace",
      connectionFactory: factory,
    });

    await Promise.all([session.initialize(), session.initialize()]);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(connection.sendRequest).toHaveBeenCalledTimes(1);
  });

  it("cleans up when initialized notification fails", async () => {
    const connection = createMockConnection();
    const process = createMockProcess();
    vi.mocked(connection.sendNotification).mockRejectedValue(
      new Error("initialized failed"),
    );
    const factory = vi.fn().mockResolvedValue({ process, connection });
    const session = new LspSession({
      command: ["typescript-language-server", "--stdio"],
      projectAnchor: "/workspace/app",
      rootPath: "/workspace",
      connectionFactory: factory,
    });

    await expect(session.initialize()).resolves.toMatchObject({
      state: "failed",
      message: "Unable to initialize TypeScript LSP: initialized failed",
      serverCapabilities: [],
    });
    expect(connection.dispose).toHaveBeenCalledTimes(1);
    expect(process.kill).toHaveBeenCalledTimes(1);
  });

  it("times out initialization and cleans up", async () => {
    vi.useFakeTimers();
    try {
      const connection = createMockConnection();
      const process = createMockProcess();
      vi.mocked(connection.sendRequest).mockReturnValue(new Promise(() => {}));
      const factory = vi.fn().mockResolvedValue({ process, connection });
      const session = new LspSession({
        command: ["typescript-language-server", "--stdio"],
        projectAnchor: "/workspace/app",
        rootPath: "/workspace",
        connectionFactory: factory,
        initializeTimeoutMs: 1,
      });

      const infoPromise = session.initialize();
      await vi.advanceTimersByTimeAsync(1);
      const info = await Promise.race([
        infoPromise,
        Promise.resolve("pending"),
      ]);

      expect(info).toEqual({
        state: "failed",
        message: "Unable to initialize TypeScript LSP: initialize timed out.",
        projectAnchor: "/workspace/app",
        rootPath: "/workspace",
        serverCapabilities: [],
      });
      expect(connection.dispose).toHaveBeenCalledTimes(1);
      expect(process.kill).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("times out unresolved initialized notification and cleans up", async () => {
    vi.useFakeTimers();
    try {
      const connection = createMockConnection();
      const process = createMockProcess();
      vi.mocked(connection.sendNotification).mockReturnValue(
        new Promise(() => {}),
      );
      const factory = vi.fn().mockResolvedValue({ process, connection });
      const session = new LspSession({
        command: ["typescript-language-server", "--stdio"],
        projectAnchor: "/workspace/app",
        rootPath: "/workspace",
        connectionFactory: factory,
        initializeTimeoutMs: 1,
      });

      const infoPromise = session.initialize();
      await vi.advanceTimersByTimeAsync(1);
      const info = await Promise.race([
        infoPromise,
        Promise.resolve("pending"),
      ]);

      expect(info).toEqual({
        state: "failed",
        message: "Unable to initialize TypeScript LSP: initialize timed out.",
        projectAnchor: "/workspace/app",
        rootPath: "/workspace",
        serverCapabilities: [],
      });
      expect(connection.dispose).toHaveBeenCalledTimes(1);
      expect(process.kill).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts default language server with stderr ignored", async () => {
    const child = new EventEmitter() as LspProcess & {
      stdin: Writable;
      stdout: Readable;
    };
    child.pid = 1234;
    child.stdin = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });
    child.stdout = new Readable({ read() {} });
    child.kill = vi.fn().mockReturnValue(true);
    spawnMock.mockReturnValue(child);

    await createNodeLspConnection({
      command: "typescript-language-server",
      args: ["--stdio"],
      cwd: "/workspace/app",
    });

    expect(spawnMock).toHaveBeenCalledWith(
      "typescript-language-server",
      ["--stdio"],
      {
        cwd: "/workspace/app",
        stdio: ["pipe", "pipe", "ignore"],
      },
    );
  });

  it("does not report disabled server capability values", () => {
    expect(
      summarizeServerCapabilities({
        definitionProvider: false,
        hoverProvider: true,
        textDocumentSync: 0,
      }),
    ).toEqual(["hoverProvider"]);
  });
});
