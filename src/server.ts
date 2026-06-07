import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { getCapabilitiesResult } from "./tools/capabilities.js";
import { getHealthResult } from "./tools/health.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "lsp-mcp",
    version: "0.0.0",
  });

  server.registerTool(
    "health",
    {
      description: "Report lsp-mcp server and language-server health.",
    },
    getHealthResult,
  );

  server.registerTool(
    "capabilities",
    {
      description: "List scaffold MCP tool capabilities.",
    },
    getCapabilitiesResult,
  );

  return server;
}

export async function startStdioServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
