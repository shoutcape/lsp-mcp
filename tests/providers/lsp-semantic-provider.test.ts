import { describe, expect, it, vi } from "vitest";

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
        state: "ready",
        message: "TypeScript LSP initialized.",
        serverCapabilities: [],
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
        state: "ready",
        message: "TypeScript LSP initialized.",
        serverCapabilities,
      }),
    };
    const provider = new LspSemanticProvider({ manager });

    await expect(
      provider.getCapabilities({ check: true, file: "src/index.ts" }),
    ).resolves.toEqual({
      status: "ready",
      supportedTools: ["health", "capabilities"],
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
});
