import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDefaultProvider, createServer } from "../src/server.js";

describe("MCP server", () => {
  const clients: Client[] = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(clients.map((client) => client.close()));
    clients.length = 0;
    await Promise.all(
      tempDirs
        .splice(0)
        .map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  async function createTempDir(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "lsp-mcp-server-"));
    tempDirs.push(dir);
    return dir;
  }

  it("registers scaffold tools and serves health over MCP", async () => {
    const server = createServer();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    clients.push(client);

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      "call_hierarchy",
      "capabilities",
      "diagnostics",
      "find_references",
      "goto_definition",
      "health",
      "hover",
      "rename",
    ]);

    const result = await client.callTool({ name: "health", arguments: {} });
    expect(result.content).toEqual([
      {
        type: "text",
        text: [
          "Status: not_started",
          "Tool: health",
          "Message: LSP sessions are not implemented in this scaffold.",
        ].join("\n"),
      },
    ]);

    await server.close();
  });

  it("uses an injected provider for tool calls", async () => {
    const server = createServer({
      provider: {
        async getHealth() {
          return {
            status: "degraded" as const,
            message: "test provider health",
          };
        },
        async getCapabilities() {
          return {
            status: "degraded" as const,
            supportedTools: ["health", "capabilities", "test_only"],
            lsp: "not_implemented" as const,
          };
        },
      } as import("../src/providers/semantic-provider.js").SemanticProvider,
    });
    const client = new Client({ name: "test-client", version: "0.0.0" });
    clients.push(client);

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const health = await client.callTool({ name: "health", arguments: {} });
    expect(health.content).toEqual([
      {
        type: "text",
        text: [
          "Status: degraded",
          "Tool: health",
          "Message: test provider health",
        ].join("\n"),
      },
    ]);

    const capabilities = await client.callTool({
      name: "capabilities",
      arguments: {},
    });
    expect(capabilities.content).toEqual([
      {
        type: "text",
        text: [
          "Status: degraded",
          "Tool: capabilities",
          "Supported tools: health, capabilities, test_only",
          "LSP: not implemented",
        ].join("\n"),
      },
    ]);

    await server.close();
  });

  it("forwards MCP health and capabilities arguments to provider", async () => {
    const healthRequests: unknown[] = [];
    const capabilitiesRequests: unknown[] = [];
    const server = createServer({
      provider: {
        async getHealth(request) {
          healthRequests.push(request);
          return {
            status: "ready" as const,
            message: "TypeScript LSP initialized.",
          };
        },
        async getCapabilities(request) {
          capabilitiesRequests.push(request);
          return {
            status: "ready" as const,
            supportedTools: ["health", "capabilities"],
            lsp: "implemented" as const,
          };
        },
      } as import("../src/providers/semantic-provider.js").SemanticProvider,
    });
    const client = new Client({ name: "test-client", version: "0.0.0" });
    clients.push(client);

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    await client.callTool({
      name: "health",
      arguments: { check: true, file: "src/index.ts" },
    });
    await client.callTool({
      name: "capabilities",
      arguments: { check: true, file: "src/index.ts" },
    });
    expect(healthRequests).toEqual([{ check: true, file: "src/index.ts" }]);
    expect(capabilitiesRequests).toEqual([
      { check: true, file: "src/index.ts" },
    ]);
    await server.close();
  });

  it("creates a default provider that starts in not_started state without config", async () => {
    const cwd = process.cwd();
    const emptyDir = await createTempDir();

    try {
      process.chdir(emptyDir);

      const provider = await createDefaultProvider();

      const health = await provider.getHealth();
      expect(health.status).toBe("not_started");
      expect((health as { setupError?: unknown }).setupError).toBeUndefined();
    } finally {
      process.chdir(cwd);
    }
  });

  it("creates a default provider that reports disabled TypeScript support", async () => {
    const cwd = process.cwd();
    const baseDir = await createTempDir();
    await writeFile(
      path.join(baseDir, "lsp-mcp.config.jsonc"),
      JSON.stringify({
        roots: ["."],
        languages: { typescript: { enabled: false } },
      }),
    );

    try {
      process.chdir(baseDir);

      const provider = await createDefaultProvider();

      await expect(provider.getHealth()).resolves.toEqual({
        status: "failed",
        message: "TypeScript language support is disabled.",
        setupError: { message: "TypeScript language support is disabled." },
      });
    } finally {
      process.chdir(cwd);
    }
  });
});

describe("withInstrumentation", () => {
  afterEach(() => {
    delete process.env.LSP_MCP_DEBUG;
  });

  it("does not emit to stderr when LSP_MCP_DEBUG is unset", async () => {
    const stderrWrite = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    delete process.env.LSP_MCP_DEBUG;

    const { withInstrumentation } = await import("../src/server.js");
    const handler = withInstrumentation("test_tool", async () => ({
      content: [{ type: "text" as const, text: "ok" }],
    }));
    await handler({});

    expect(stderrWrite).not.toHaveBeenCalled();
    stderrWrite.mockRestore();
  });

  it("writes to stderr (not stdout) when LSP_MCP_DEBUG is set", async () => {
    const stderrWrite = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    process.env.LSP_MCP_DEBUG = "1";

    const { withInstrumentation } = await import("../src/server.js");
    const handler = withInstrumentation("test_tool", async () => ({
      content: [{ type: "text" as const, text: "hello world" }],
    }));
    await handler({});

    expect(stderrWrite).toHaveBeenCalledWith(
      expect.stringContaining("test_tool"),
    );
    expect(stdoutWrite).not.toHaveBeenCalled();
    stderrWrite.mockRestore();
    stdoutWrite.mockRestore();
  });
});
