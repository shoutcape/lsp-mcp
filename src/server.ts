import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import type { SemanticProvider } from "./providers/semantic-provider.js";
import { StaticSemanticProvider } from "./providers/static-semantic-provider.js";
import { createCapabilitiesTool } from "./tools/capabilities.js";
import { createHealthTool } from "./tools/health.js";

export interface ServerDependencies {
  provider?: SemanticProvider;
}

export function createServer(dependencies: ServerDependencies = {}): McpServer {
  const provider = dependencies.provider ?? new StaticSemanticProvider();
  const server = new McpServer({
    name: "lsp-mcp",
    version: "0.0.0",
  });

  server.registerTool(
    "health",
    {
      description: "Report lsp-mcp server and language-server health.",
    },
    createHealthTool(provider),
  );

  server.registerTool(
    "capabilities",
    {
      description: "List scaffold MCP tool capabilities.",
    },
    createCapabilitiesTool(provider),
  );

  return server;
}

export async function startStdioServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
