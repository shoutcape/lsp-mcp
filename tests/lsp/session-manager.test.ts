import { describe, expect, it, vi } from "vitest";

import { createTypeScriptPreset } from "../../src/languages/typescript/preset.js";
import {
  type LspSessionInfo,
  LspSessionManager,
} from "../../src/lsp/session-manager.js";

const command = ["typescript-language-server", "--stdio"];
const roots = [{ path: "/workspace" }];
const preset = createTypeScriptPreset({
  enabled: true,
  command,
  extensions: [".ts"],
  projectMarkers: ["tsconfig.json", "package.json"],
});
const readyInfo: LspSessionInfo = {
  state: "ready",
  message: "TypeScript LSP initialized.",
  projectAnchor: "/workspace/app",
  rootPath: "/workspace",
  serverCapabilities: ["definitionProvider"],
};

describe("LspSessionManager", () => {
  it("reports not_started before any active check", () => {
    const manager = new LspSessionManager({
      command,
      roots,
      preset,
      sessionFactory: vi.fn(),
    });

    expect(manager.getSummary()).toEqual({
      state: "not_started",
      message: "TypeScript LSP sessions are not started.",
      serverCapabilities: [],
    });
  });

  it("creates and caches a session by routed project anchor", async () => {
    const initialize = vi.fn().mockResolvedValue(readyInfo);
    const routeProject = vi.fn().mockResolvedValue({
      ok: true,
      path: "/workspace/app/src/index.ts",
      root: { path: "/workspace" },
      projectAnchor: "/workspace/app",
      languageId: "typescript",
    });
    const sessionFactory = vi.fn(() => ({ initialize }));
    const manager = new LspSessionManager({
      command,
      roots,
      preset,
      routeProject,
      sessionFactory,
    });

    await expect(
      manager.ensureSession("app/src/index.ts"),
    ).resolves.toMatchObject({ info: readyInfo });
    await expect(
      manager.ensureSession("app/src/index.ts"),
    ).resolves.toMatchObject({ info: readyInfo });

    expect(sessionFactory).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledTimes(2);
  });

  it("keeps summary stable when session info is mutated after initialize", async () => {
    const sessionInfo: LspSessionInfo = {
      ...readyInfo,
      serverCapabilities: [...readyInfo.serverCapabilities],
    };
    const initialize = vi.fn().mockResolvedValue(sessionInfo);
    const routeProject = vi.fn().mockResolvedValue({
      ok: true,
      path: "/workspace/app/src/index.ts",
      root: { path: "/workspace" },
      projectAnchor: "/workspace/app",
      languageId: "typescript",
    });
    const manager = new LspSessionManager({
      command,
      roots,
      preset,
      routeProject,
      sessionFactory: vi.fn(() => ({ initialize })),
    });

    await manager.ensureSession("app/src/index.ts");
    sessionInfo.message = "mutated";
    sessionInfo.serverCapabilities.push("hoverProvider");

    expect(manager.getSummary()).toEqual({
      state: "ready",
      message: "TypeScript LSP initialized.",
      serverCapabilities: ["definitionProvider"],
    });
  });

  it("does not leak raw server capability refs from returned info", async () => {
    const rawServerCapabilities = {
      completionProvider: { triggerCharacters: ["."] },
    };
    const sessionInfo: LspSessionInfo = {
      ...readyInfo,
      rawServerCapabilities,
    };
    const initialize = vi.fn().mockResolvedValue(sessionInfo);
    const routeProject = vi.fn().mockResolvedValue({
      ok: true,
      path: "/workspace/app/src/index.ts",
      root: { path: "/workspace" },
      projectAnchor: "/workspace/app",
      languageId: "typescript",
    });
    const manager = new LspSessionManager({
      command,
      roots,
      preset,
      routeProject,
      sessionFactory: vi.fn(() => ({ initialize })),
    });

    const result = await manager.ensureSession("app/src/index.ts");
    const returnedCompletionProvider =
      result.info.rawServerCapabilities?.completionProvider;

    if (returnedCompletionProvider?.triggerCharacters === undefined) {
      throw new Error("expected completion trigger characters");
    }

    returnedCompletionProvider.triggerCharacters.push("#");
    const nextResult = await manager.ensureSession("app/src/index.ts");

    expect(nextResult.info.rawServerCapabilities?.completionProvider).toEqual({
      triggerCharacters: ["."],
    });
  });

  it("routes with roots cloned during construction", async () => {
    const mutableRoots: [{ path: string }] = [{ path: "/workspace" }];
    const routeProject = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        code: "unsupported_file_type",
        message: "Unsupported TypeScript file extension: README.md",
      },
    });
    const manager = new LspSessionManager({
      command,
      roots: mutableRoots,
      preset,
      routeProject,
      sessionFactory: vi.fn(),
    });

    mutableRoots[0].path = "/mutated";
    mutableRoots.push({ path: "/other" });
    await manager.ensureSession("README.md");

    expect(routeProject).toHaveBeenCalledWith({
      requestedPath: "README.md",
      roots: [{ path: "/workspace" }],
      preset,
    });
  });

  it("returns failed info when routing fails", async () => {
    const routeProject = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        code: "unsupported_file_type",
        message: "Unsupported TypeScript file extension: README.md",
      },
    });
    const manager = new LspSessionManager({
      command,
      roots,
      preset,
      routeProject,
      sessionFactory: vi.fn(),
    });

    await expect(manager.ensureSession("README.md")).resolves.toMatchObject({
      info: {
        state: "failed",
        message: "Unsupported TypeScript file extension: README.md",
        projectAnchor: "",
        rootPath: "",
        serverCapabilities: [],
      },
    });
  });
});
