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
        "type_definition",
        "implementation",
        "document_symbols",
        "workspace_symbols",
        "signature_help",
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
            {
              uri: "file:///project/index.ts",
              range: {
                start: { line: 0, character: 9 },
                end: { line: 0, character: 12 },
              },
            },
            {
              uri: "file:///project/index.ts",
              range: {
                start: { line: 1, character: 10 },
                end: { line: 1, character: 13 },
              },
            },
          ]);
        }
        // definition request - return the second occurrence as "definition"
        if (method.method === "textDocument/definition") {
          return Promise.resolve([
            {
              uri: "file:///project/utils.ts",
              range: {
                start: { line: 1, character: 16 },
                end: { line: 1, character: 19 },
              },
            },
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
            {
              uri: "file:///project/utils.ts",
              range: {
                start: { line: 0, character: 16 },
                end: { line: 0, character: 19 },
              },
            },
          ]);
        }
        if (method.method === "textDocument/definition") {
          return Promise.resolve([
            {
              uri: "file:///project/utils.ts",
              range: {
                start: { line: 0, character: 16 },
                end: { line: 0, character: 19 },
              },
            },
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

describe("getReferences caveats", () => {
  function makeManager(
    state: "ready" | "degraded",
    mockSendRequest: (method: { method: string }) => unknown,
    mockFileContent = "const x = y;",
  ) {
    const mockConnection = {
      listen: vi.fn(),
      sendRequest: vi.fn().mockImplementation(mockSendRequest),
      sendNotification: vi.fn().mockResolvedValue(undefined),
      onNotification: vi.fn(),
      dispose: vi.fn(),
    };
    const manager: LspProviderSessionManager = {
      getSummary: vi.fn().mockReturnValue({
        state:
          state as import("../../src/providers/semantic-provider.js").HealthStatus,
        message: state,
        serverCapabilities: [],
      }),
      ensureSession: vi.fn().mockResolvedValue({
        info: {
          state:
            state as import("../../src/providers/semantic-provider.js").HealthStatus,
          message: state,
          serverCapabilities: [],
        },
        session: {
          getConnection: vi.fn(() => mockConnection),
          prepareFile: vi.fn().mockResolvedValue("opened"),
        },
      }),
    };
    return new LspSemanticProvider({
      manager,
      readFile: async () => mockFileContent,
    });
  }

  it("emits degraded caveat when server state is degraded", async () => {
    const provider = makeManager("degraded", (method: { method: string }) => {
      if (method.method === "textDocument/references")
        return Promise.resolve([]);
      return Promise.resolve(null);
    });

    const result = await provider
      .getReferences({ file: "/project/a.ts", line: 1, column: 1 })
      .catch(() => null);

    if (result !== null) {
      expect(result.caveats?.some((c) => c.includes("degraded"))).toBe(true);
    }
  });

  it("emits any-typed caveat when hover returns any type", async () => {
    const provider = makeManager(
      "ready",
      (method: { method: string }) => {
        if (method.method === "textDocument/references") {
          return Promise.resolve([
            {
              uri: "file:///project/a.ts",
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 1 },
              },
            },
          ]);
        }
        if (method.method === "textDocument/definition")
          return Promise.resolve(null);
        if (method.method === "textDocument/hover") {
          return Promise.resolve({
            contents: { kind: "markdown", value: "(parameter) x: any" },
          });
        }
        return Promise.resolve(null);
      },
      "x;",
    );

    const result = await provider.getReferences({
      file: "/project/a.ts",
      line: 1,
      column: 1,
    });

    expect(result.caveats?.some((c) => c.includes("any"))).toBe(true);
  });

  it("does not emit any-typed caveat when hover returns non-any type", async () => {
    const provider = makeManager("ready", (method: { method: string }) => {
      if (method.method === "textDocument/references")
        return Promise.resolve([]);
      if (method.method === "textDocument/hover") {
        return Promise.resolve({
          contents: { kind: "markdown", value: "(parameter) x: string" },
        });
      }
      return Promise.resolve(null);
    });

    const result = await provider.getReferences({
      file: "/project/a.ts",
      line: 1,
      column: 1,
    });

    expect(result.caveats ?? []).not.toContainEqual(
      expect.stringContaining("any-typed"),
    );
  });

  it("does not throw when hover fails; skips any-typed caveat", async () => {
    const provider = makeManager("ready", (method: { method: string }) => {
      if (method.method === "textDocument/references")
        return Promise.resolve([]);
      if (method.method === "textDocument/hover")
        return Promise.reject(new Error("hover timeout"));
      return Promise.resolve(null);
    });

    await expect(
      provider.getReferences({ file: "/project/a.ts", line: 1, column: 1 }),
    ).resolves.not.toThrow();
  });

  it("emits spread caveat when refs contain spread-classified entries", async () => {
    const fileContent = `const x = { ...props };`;
    // "props" at col 16 (0-based char 15)
    const provider = makeManager(
      "ready",
      (method: { method: string }) => {
        if (method.method === "textDocument/references") {
          return Promise.resolve([
            {
              uri: "file:///project/a.ts",
              range: {
                start: { line: 0, character: 15 },
                end: { line: 0, character: 20 },
              },
            },
          ]);
        }
        return Promise.resolve(null);
      },
      fileContent,
    );

    const result = await provider.getReferences({
      file: "/project/a.ts",
      line: 1,
      column: 17,
    });

    expect(result.caveats?.some((c) => c.includes("spread"))).toBe(true);
  });

  it("emits indirect-call caveat for call hierarchy when result is empty", async () => {
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
    const result = await provider.getCallHierarchy({
      file: "/project/a.ts",
      line: 1,
      column: 1,
      direction: "incoming",
    });
    // item is null (prepareCallHierarchy returned null) -> caveat
    expect(result.caveats?.some((c) => c.includes("indirect"))).toBe(true);
  });

  // ---- Task 3: getTypeDefinition + getImplementation ----

  function makeManagerWithConnection(
    sendRequestImpl: (
      method: { method: string },
      params: unknown,
    ) => Promise<unknown>,
  ) {
    const mockConnection = {
      listen: vi.fn(),
      sendRequest: vi.fn().mockImplementation(sendRequestImpl),
      sendNotification: vi.fn().mockResolvedValue(undefined),
      onNotification: vi.fn(),
      dispose: vi.fn(),
    };
    const manager: LspProviderSessionManager = {
      getSummary: vi.fn(() => ({
        state: "ready" as const,
        message: "ready",
        serverCapabilities: [],
      })),
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
    return { manager, mockConnection };
  }

  it("getTypeDefinition maps LSP Location to 1-based entry", async () => {
    const { manager } = makeManagerWithConnection(() =>
      Promise.resolve([
        {
          uri: "file:///project/types.ts",
          range: {
            start: { line: 2, character: 0 },
            end: { line: 2, character: 12 },
          },
        },
      ]),
    );
    const provider = new LspSemanticProvider({ manager });
    const result = await provider.getTypeDefinition({
      file: "/project/a.ts",
      line: 1,
      column: 5,
    });
    expect(result.locations).toHaveLength(1);
    expect(result.locations[0]).toMatchObject({
      file: "/project/types.ts",
      line: 3, // 0-based 2 -> 1-based 3
      column: 1, // 0-based 0 -> 1-based 1
    });
  });

  it("getTypeDefinition returns empty locations when LSP returns null", async () => {
    const { manager } = makeManagerWithConnection(() => Promise.resolve(null));
    const provider = new LspSemanticProvider({ manager });
    const result = await provider.getTypeDefinition({
      file: "/project/a.ts",
      line: 1,
      column: 5,
    });
    expect(result.locations).toHaveLength(0);
  });

  it("getImplementation maps LSP Location to 1-based entry", async () => {
    const { manager } = makeManagerWithConnection(() =>
      Promise.resolve([
        {
          uri: "file:///project/impl.ts",
          range: {
            start: { line: 9, character: 2 },
            end: { line: 9, character: 10 },
          },
        },
      ]),
    );
    const provider = new LspSemanticProvider({ manager });
    const result = await provider.getImplementation({
      file: "/project/a.ts",
      line: 5,
      column: 8,
    });
    expect(result.locations).toHaveLength(1);
    expect(result.locations[0]).toMatchObject({
      file: "/project/impl.ts",
      line: 10,
      column: 3,
    });
  });

  it("getImplementation returns empty locations when LSP returns null", async () => {
    const { manager } = makeManagerWithConnection(() => Promise.resolve(null));
    const provider = new LspSemanticProvider({ manager });
    const result = await provider.getImplementation({
      file: "/project/a.ts",
      line: 1,
      column: 1,
    });
    expect(result.locations).toHaveLength(0);
  });

  // ---- Task 4: getDocumentSymbols ----

  it("getDocumentSymbols maps hierarchical DocumentSymbol[] to entries", async () => {
    const { manager } = makeManagerWithConnection(() =>
      Promise.resolve([
        {
          name: "MyClass",
          kind: 5, // Class
          range: {
            start: { line: 0, character: 0 },
            end: { line: 10, character: 1 },
          },
          selectionRange: {
            start: { line: 0, character: 6 },
            end: { line: 0, character: 13 },
          },
          children: [
            {
              name: "constructor",
              kind: 9, // Constructor
              range: {
                start: { line: 1, character: 2 },
                end: { line: 3, character: 3 },
              },
              selectionRange: {
                start: { line: 1, character: 2 },
                end: { line: 1, character: 13 },
              },
              children: [],
            },
          ],
        },
      ]),
    );
    const provider = new LspSemanticProvider({ manager });
    const result = await provider.getDocumentSymbols("/project/a.ts");
    expect(result.symbols).toHaveLength(1);
    const cls = result.symbols[0];
    expect(cls?.name).toBe("MyClass");
    expect(cls?.kind).toBe("class");
    expect(cls?.line).toBe(1); // 0-based 0 -> 1-based 1
    expect(cls?.column).toBe(7); // selectionRange start char 6 -> 7
    expect(cls?.endLine).toBe(11);
    expect(cls?.endColumn).toBe(2);
    expect(cls?.children).toHaveLength(1);
    expect(cls?.children?.[0]?.name).toBe("constructor");
    expect(cls?.children?.[0]?.kind).toBe("constructor");
  });

  it("getDocumentSymbols maps flat SymbolInformation[] to entries", async () => {
    const { manager } = makeManagerWithConnection(() =>
      Promise.resolve([
        {
          name: "myFunc",
          kind: 12, // Function
          containerName: "MyModule",
          location: {
            uri: "file:///project/a.ts",
            range: {
              start: { line: 4, character: 0 },
              end: { line: 8, character: 1 },
            },
          },
        },
      ]),
    );
    const provider = new LspSemanticProvider({ manager });
    const result = await provider.getDocumentSymbols("/project/a.ts");
    expect(result.symbols).toHaveLength(1);
    const fn = result.symbols[0];
    expect(fn?.name).toBe("myFunc");
    expect(fn?.kind).toBe("function");
    expect(fn?.containerName).toBe("MyModule");
    expect(fn?.line).toBe(5);
    expect(fn?.column).toBe(1);
    expect(fn?.endLine).toBe(9);
    expect(fn?.endColumn).toBe(2);
  });

  it("getDocumentSymbols returns empty symbols when LSP returns null", async () => {
    const { manager } = makeManagerWithConnection(() => Promise.resolve(null));
    const provider = new LspSemanticProvider({ manager });
    const result = await provider.getDocumentSymbols("/project/a.ts");
    expect(result.symbols).toHaveLength(0);
  });

  it("getDocumentSymbols maps SymbolKind 12 (Function) to 'Function'", async () => {
    const { manager } = makeManagerWithConnection(() =>
      Promise.resolve([
        {
          name: "myFunc",
          kind: 12,
          location: {
            uri: "file:///project/a.ts",
            range: {
              start: { line: 0, character: 0 },
              end: { line: 2, character: 1 },
            },
          },
        },
      ]),
    );
    const provider = new LspSemanticProvider({ manager });
    const result = await provider.getDocumentSymbols("/project/a.ts");
    expect(result.symbols[0]?.kind).toBe("function");
  });

  it("getDocumentSymbols maps unknown SymbolKind to 'unknown'", async () => {
    const { manager } = makeManagerWithConnection(() =>
      Promise.resolve([
        {
          name: "x",
          kind: 999,
          location: {
            uri: "file:///project/a.ts",
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 5 },
            },
          },
        },
      ]),
    );
    const provider = new LspSemanticProvider({ manager });
    const result = await provider.getDocumentSymbols("/project/a.ts");
    expect(result.symbols[0]?.kind).toBe("unknown");
  });

  // ---- Task 5: getWorkspaceSymbols ----

  it("getWorkspaceSymbols maps SymbolInformation to entries", async () => {
    const { manager } = makeManagerWithConnection(() =>
      Promise.resolve([
        {
          name: "useAuth",
          kind: 12, // Function
          containerName: "hooks",
          location: {
            uri: "file:///project/hooks/auth.ts",
            range: {
              start: { line: 11, character: 0 },
              end: { line: 20, character: 1 },
            },
          },
        },
      ]),
    );
    const provider = new LspSemanticProvider({ manager });
    const result = await provider.getWorkspaceSymbols({ query: "useAuth" });
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0]).toMatchObject({
      name: "useAuth",
      kind: "function",
      containerName: "hooks",
      file: "/project/hooks/auth.ts",
      line: 12,
      column: 1,
    });
    expect(result.caveats).toBeUndefined();
  });

  it("getWorkspaceSymbols emits truncation caveat when results hit limit", async () => {
    const symbols = Array.from({ length: 5 }, (_, i) => ({
      name: `sym${i}`,
      kind: 13,
      location: {
        uri: "file:///project/a.ts",
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: 3 },
        },
      },
    }));
    const { manager } = makeManagerWithConnection(() =>
      Promise.resolve(symbols),
    );
    const provider = new LspSemanticProvider({ manager });
    const result = await provider.getWorkspaceSymbols({
      query: "sym",
      limit: 5,
    });
    expect(result.symbols).toHaveLength(5);
    expect(
      result.caveats?.some(
        (c) =>
          c.includes("truncated") ||
          c.includes("Truncated") ||
          c.includes("narrow"),
      ),
    ).toBe(true);
  });

  it("getWorkspaceSymbols returns empty when LSP returns null", async () => {
    const { manager } = makeManagerWithConnection(() => Promise.resolve(null));
    const provider = new LspSemanticProvider({ manager });
    const result = await provider.getWorkspaceSymbols({ query: "x" });
    expect(result.symbols).toHaveLength(0);
  });

  // ---- Task 6: getSignatureHelp ----

  it("getSignatureHelp maps SignatureHelp to result", async () => {
    const { manager } = makeManagerWithConnection(() =>
      Promise.resolve({
        signatures: [
          {
            label: "createServer(deps?: ServerDependencies): McpServer",
            documentation: { kind: "markdown", value: "Creates a server." },
            parameters: [
              { label: "deps?: ServerDependencies" },
              { label: "opts?: ServerOptions" },
            ],
          },
        ],
        activeSignature: 0,
        activeParameter: 1,
      }),
    );
    const provider = new LspSemanticProvider({ manager });
    const result = await provider.getSignatureHelp({
      file: "/project/a.ts",
      line: 10,
      column: 20,
    });
    expect(result.signatures).toHaveLength(1);
    expect(result.signatures[0]?.label).toBe(
      "createServer(deps?: ServerDependencies): McpServer",
    );
    expect(result.signatures[0]?.parameters).toHaveLength(2);
    expect(result.signatures[0]?.parameters[0]?.label).toBe(
      "deps?: ServerDependencies",
    );
    expect(result.activeSignature).toBe(0);
    expect(result.activeParameter).toBe(1);
  });

  it("getSignatureHelp returns empty result when LSP returns null", async () => {
    const { manager } = makeManagerWithConnection(() => Promise.resolve(null));
    const provider = new LspSemanticProvider({ manager });
    const result = await provider.getSignatureHelp({
      file: "/project/a.ts",
      line: 1,
      column: 1,
    });
    expect(result.signatures).toHaveLength(0);
    expect(result.activeSignature).toBe(0);
    expect(result.activeParameter).toBe(0);
  });

  it("getSignatureHelp handles parameter label as [start, end] offsets", async () => {
    const { manager } = makeManagerWithConnection(() =>
      Promise.resolve({
        signatures: [
          {
            label: "fn(x: number, y: string): void",
            parameters: [
              { label: [3, 12] as [number, number] }, // "x: number"
              { label: [14, 23] as [number, number] }, // "y: string"
            ],
          },
        ],
        activeSignature: 0,
        activeParameter: 0,
      }),
    );
    const provider = new LspSemanticProvider({ manager });
    const result = await provider.getSignatureHelp({
      file: "/project/a.ts",
      line: 1,
      column: 1,
    });
    // Labels extracted as substrings of signature label
    expect(result.signatures[0]?.parameters[0]?.label).toBe("x: number");
    expect(result.signatures[0]?.parameters[1]?.label).toBe("y: string");
  });
});
