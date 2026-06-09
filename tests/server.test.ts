import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

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
      "capabilities",
      "diagnostics",
      "find_references",
      "goto_definition",
      "health",
      "hover",
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
      },
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
      },
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
