import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { DiagnosticsStore } from "../../src/lsp/diagnostics-store.js";
import {
  type LspProviderSessionManager,
  LspSemanticProvider,
} from "../../src/providers/lsp-semantic-provider.js";

describe("LspSemanticProvider", () => {
  it("reports passive health without starting a session", async () => {
    const manager: LspProviderSessionManager = {
      getSummary: vi.fn(() => ({
        state: "not_started",
        message: "TypeScript LSP sessions are not started.",
        serverCapabilities: [],
      })),
      ensureSession: vi.fn(),
    };
    const provider = new LspSemanticProvider({ manager });

    await expect(provider.getHealth()).resolves.toEqual({
      status: "not_started",
      message: "TypeScript LSP sessions are not started.",
    });
    expect(manager.ensureSession).not.toHaveBeenCalled();
  });

  it("requires a file path for active health checks", async () => {
    const manager: LspProviderSessionManager = {
      getSummary: vi.fn(),
      ensureSession: vi.fn(),
    };
    const provider = new LspSemanticProvider({ manager });

    await expect(provider.getHealth({ check: true })).resolves.toEqual({
      status: "failed",
      message: "Active TypeScript LSP checks require a file path.",
    });
    expect(manager.ensureSession).not.toHaveBeenCalled();
  });

  it("starts a session for active health checks", async () => {
    const manager: LspProviderSessionManager = {
      getSummary: vi.fn(),
      ensureSession: vi.fn().mockResolvedValue({
        info: {
          state: "ready",
          message: "TypeScript LSP initialized.",
          serverCapabilities: [],
        },
        session: {},
      }),
    };
    const provider = new LspSemanticProvider({ manager });

    await expect(
      provider.getHealth({ check: true, file: "src/index.ts" }),
    ).resolves.toEqual({
      status: "ready",
      message: "TypeScript LSP initialized.",
    });
    expect(manager.ensureSession).toHaveBeenCalledWith("src/index.ts");
  });

  it("reports active capabilities with live server capability names", async () => {
    const serverCapabilities = ["definitionProvider", "hoverProvider"];
    const manager: LspProviderSessionManager = {
      getSummary: vi.fn(),
      ensureSession: vi.fn().mockResolvedValue({
        info: {
          state: "ready",
          message: "TypeScript LSP initialized.",
          serverCapabilities,
        },
        session: {},
      }),
    };
    const provider = new LspSemanticProvider({ manager });

    await expect(
      provider.getCapabilities({ check: true, file: "src/index.ts" }),
    ).resolves.toEqual({
      status: "ready",
      supportedTools: [
        "health",
        "capabilities",
        "goto_definition",
        "find_references",
        "hover",
        "diagnostics",
        "rename",
        "call_hierarchy",
      ],
      lsp: "implemented",
      serverCapabilities,
    });
    expect(manager.ensureSession).toHaveBeenCalledWith("src/index.ts");
  });

  it("surfaces setup errors in health", async () => {
    const manager: LspProviderSessionManager = {
      getSummary: vi.fn(() => ({
        state: "failed",
        message: "unreachable",
        serverCapabilities: [],
      })),
      ensureSession: vi.fn(),
    };
    const provider = new LspSemanticProvider({
      manager,
      setupError: { message: "No workspace roots configured." },
    });

    await expect(provider.getHealth()).resolves.toEqual({
      status: "failed",
      message: "No workspace roots configured.",
      setupError: { message: "No workspace roots configured." },
    });
    expect(manager.ensureSession).not.toHaveBeenCalled();
  });

  it("does not leak setup error references through health", async () => {
    const manager: LspProviderSessionManager = {
      getSummary: vi.fn(() => ({
        state: "failed",
        message: "unreachable",
        serverCapabilities: [],
      })),
      ensureSession: vi.fn(),
    };
    const provider = new LspSemanticProvider({
      manager,
      setupError: { message: "No workspace roots configured." },
    });

    const health = await provider.getHealth();
    if (health.setupError === undefined) {
      throw new Error("expected setup error");
    }

    health.setupError.message = "mutated";

    await expect(provider.getHealth()).resolves.toEqual({
      status: "failed",
      message: "No workspace roots configured.",
      setupError: { message: "No workspace roots configured." },
    });
  });

  it("uses cached diagnostics for unchanged prepared files", async () => {
    const file = "/tmp/broken.ts";
    const uri = pathToFileURL(file).toString();
    const diagnosticsStore = new DiagnosticsStore();
    diagnosticsStore.onDiagnostics({
      uri,
      diagnostics: [
        {
          range: {
            start: { line: 1, character: 6 },
            end: { line: 1, character: 7 },
          },
          message: "Type 'string' is not assignable to type 'number'.",
          severity: 1,
          code: 2322,
        },
      ],
    });

    const manager: LspProviderSessionManager = {
      getSummary: vi.fn(),
      ensureSession: vi.fn().mockResolvedValue({
        info: {
          state: "ready",
          message: "TypeScript LSP initialized.",
          serverCapabilities: [],
        },
        session: {
          initialize: vi.fn(),
          getConnection: vi.fn(),
          getDiagnosticsStore: vi.fn(() => diagnosticsStore),
          prepareFile: vi.fn().mockResolvedValue("unchanged"),
        },
      }),
    };
    const provider = new LspSemanticProvider({ manager });

    const result = await provider.getDiagnostics({ file });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe(2322);
  });

  it("includes rename and call_hierarchy in supported tools", async () => {
    const manager: LspProviderSessionManager = {
      getSummary: vi.fn(),
      ensureSession: vi.fn().mockResolvedValue({
        info: {
          state: "ready" as const,
          message: "TypeScript LSP initialized.",
          serverCapabilities: [],
        },
        session: {},
      }),
    };
    const provider = new LspSemanticProvider({ manager });

    const caps = await provider.getCapabilities({
      check: true,
      file: "src/index.ts",
    });
    expect(caps.supportedTools).toContain("rename");
    expect(caps.supportedTools).toContain("call_hierarchy");
  });

  it("getRename returns canRename=false when prepareRename returns null", async () => {
    const mockConnection = {
      listen: vi.fn(),
      sendRequest: vi.fn().mockResolvedValue(null),
      sendNotification: vi.fn().mockResolvedValue(undefined),
      onNotification: vi.fn(),
      dispose: vi.fn(),
    };
    const manager: LspProviderSessionManager = {
      getSummary: vi.fn(),
      ensureSession: vi.fn().mockResolvedValue({
        info: {
          state: "ready" as const,
          message: "ready",
          serverCapabilities: [],
        },
        session: {
          getConnection: vi.fn(() => mockConnection),
          prepareFile: vi.fn().mockResolvedValue("opened"),
        },
      }),
    };
    const provider = new LspSemanticProvider({ manager });

    const result = await provider.getRename({
      file: "/tmp/a.ts",
      line: 1,
      column: 1,
      newName: "newName",
    });

    expect(result.canRename).toBe(false);
    expect(result.locations).toHaveLength(0);
  });

  it("getReferences returns kind on each entry", async () => {
    // Source with a known import reference
    const mockFileContent = `import { add } from "./utils";\nconst x = add(1,2);`;
    const mockConnection = {
      listen: vi.fn(),
      sendRequest: vi.fn().mockImplementation((method: { method: string }) => {
        if (method.method === "textDocument/references") {
          return Promise.resolve([
            { uri: "file:///project/index.ts", range: { start: { line: 0, character: 9 }, end: { line: 0, character: 12 } } },
            { uri: "file:///project/index.ts", range: { start: { line: 1, character: 10 }, end: { line: 1, character: 13 } } },
          ]);
        }
        // definition request - return the second occurrence as "definition"
        if (method.method === "textDocument/definition") {
          return Promise.resolve([
            { uri: "file:///project/utils.ts", range: { start: { line: 1, character: 16 }, end: { line: 1, character: 19 } } },
          ]);
        }
        return Promise.resolve(null);
      }),
      sendNotification: vi.fn().mockResolvedValue(undefined),
      onNotification: vi.fn(),
      dispose: vi.fn(),
    };

    const manager: LspProviderSessionManager = {
      getSummary: vi.fn(),
      ensureSession: vi.fn().mockResolvedValue({
        info: { state: "ready" as const, message: "ready", serverCapabilities: [] },
        session: {
          getConnection: vi.fn(() => mockConnection),
          prepareFile: vi.fn().mockResolvedValue("opened"),
        },
      }),
    };

    // Inject readFile that returns our mock content for the index.ts file
    const provider = new LspSemanticProvider({
      manager,
      readFile: async (_path: string) => mockFileContent,
    });

    const result = await provider.getReferences({
      file: "/project/index.ts",
      line: 1,
      column: 10,
    });

    expect(result.references.length).toBe(2);
    const kinds = result.references.map((r) => r.kind);
    expect(kinds).toContain("import");
    expect(kinds).toContain("call");
  });

  it("getReferences marks isDefinition=true when ref matches definition position", async () => {
    const mockFileContent = `export function add(a: number): number { return a; }`;
    const mockConnection = {
      listen: vi.fn(),
      sendRequest: vi.fn().mockImplementation((method: { method: string }) => {
        if (method.method === "textDocument/references") {
          return Promise.resolve([
            { uri: "file:///project/utils.ts", range: { start: { line: 0, character: 16 }, end: { line: 0, character: 19 } } },
          ]);
        }
        if (method.method === "textDocument/definition") {
          return Promise.resolve([
            { uri: "file:///project/utils.ts", range: { start: { line: 0, character: 16 }, end: { line: 0, character: 19 } } },
          ]);
        }
        return Promise.resolve(null);
      }),
      sendNotification: vi.fn().mockResolvedValue(undefined),
      onNotification: vi.fn(),
      dispose: vi.fn(),
    };

    const manager: LspProviderSessionManager = {
      getSummary: vi.fn(),
      ensureSession: vi.fn().mockResolvedValue({
        info: { state: "ready" as const, message: "ready", serverCapabilities: [] },
        session: {
          getConnection: vi.fn(() => mockConnection),
          prepareFile: vi.fn().mockResolvedValue("opened"),
        },
      }),
    };

    const provider = new LspSemanticProvider({
      manager,
      readFile: async (_path: string) => mockFileContent,
    });

    const result = await provider.getReferences({
      file: "/project/utils.ts",
      line: 1,
      column: 17,
    });

    expect(result.references.length).toBe(1);
    expect(result.references[0]?.isDefinition).toBe(true);
    expect(result.references[0]?.kind).toBe("definition");
  });
});
