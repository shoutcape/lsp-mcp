import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./config/load-config.js";
import { createTypeScriptPreset } from "./languages/typescript/preset.js";
import { LspSessionManager } from "./lsp/session-manager.js";
import { LspSemanticProvider } from "./providers/lsp-semantic-provider.js";
import type {
  SemanticProvider,
  SetupErrorInfo,
} from "./providers/semantic-provider.js";
import { StaticSemanticProvider } from "./providers/static-semantic-provider.js";
import {
  capabilitiesToolInputSchema,
  createCapabilitiesTool,
} from "./tools/capabilities.js";
import { createHealthTool, healthToolInputSchema } from "./tools/health.js";
import { resolveWorkspaceRoots } from "./workspace/resolve-roots.js";

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
      inputSchema: healthToolInputSchema,
    },
    createHealthTool(provider),
  );

  server.registerTool(
    "capabilities",
    {
      description: "List scaffold MCP tool capabilities.",
      inputSchema: capabilitiesToolInputSchema,
    },
    createCapabilitiesTool(provider),
  );

  return server;
}

export async function createDefaultProvider(): Promise<SemanticProvider> {
  const configResult = await loadConfig();

  if (!configResult.ok) {
    return createSetupErrorProvider(configResult.error.message);
  }

  if (!configResult.config.languages.typescript.enabled) {
    return createSetupErrorProvider("TypeScript language support is disabled.");
  }

  const rootsResult = resolveWorkspaceRoots({
    roots: configResult.config.roots,
    baseDir: configResult.baseDir,
  });

  if (!rootsResult.ok) {
    return createSetupErrorProvider(rootsResult.error.message);
  }

  const preset = createTypeScriptPreset(
    configResult.config.languages.typescript,
  );
  const manager = new LspSessionManager({
    command: preset.getCommand(),
    roots: rootsResult.roots,
    preset,
  });

  return new LspSemanticProvider({ manager });
}

export async function startStdioServer(): Promise<void> {
  const provider = await createDefaultProvider();
  const server = createServer({ provider });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function createSetupErrorProvider(message: string): SemanticProvider {
  const setupError: SetupErrorInfo = { message };
  const manager = {
    getSummary() {
      return {
        state: "failed" as const,
        message,
        serverCapabilities: [],
      };
    },
    async ensureSession() {
      return {
        state: "failed" as const,
        message,
        serverCapabilities: [],
      };
    },
  };

  return new LspSemanticProvider({ manager, setupError });
}
