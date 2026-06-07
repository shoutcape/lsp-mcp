import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { createServer } from "../src/server.js";

describe("MCP server", () => {
  const clients: Client[] = [];

  afterEach(async () => {
    await Promise.all(clients.map((client) => client.close()));
    clients.length = 0;
  });

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
      "health",
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
});
