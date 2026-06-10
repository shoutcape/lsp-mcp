import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { loadConfig } from "./config/load-config.js";
import { createTypeScriptPreset } from "./languages/typescript/preset.js";
import type { EnsureSessionResult } from "./lsp/session-manager.js";
import { LspSessionManager } from "./lsp/session-manager.js";
import { LspSemanticProvider } from "./providers/lsp-semantic-provider.js";
import type {
  SemanticProvider,
  SetupErrorInfo,
} from "./providers/semantic-provider.js";
import { StaticSemanticProvider } from "./providers/static-semantic-provider.js";
import { createCallHierarchyTool } from "./tools/call-hierarchy.js";
import {
  capabilitiesToolInputSchema,
  createCapabilitiesTool,
} from "./tools/capabilities.js";
import { createDefinitionTool } from "./tools/definition.js";
import { createDiagnosticsTool } from "./tools/diagnostics.js";
import { createHealthTool, healthToolInputSchema } from "./tools/health.js";
import { createHoverTool } from "./tools/hover.js";
import { createReferencesTool } from "./tools/references.js";
import { createRenameTool } from "./tools/rename.js";
import { resolveWorkspaceRoots } from "./workspace/resolve-roots.js";

export const fileLocationInputSchema = {
  file: z.string().describe("Absolute path to the TypeScript/JavaScript file"),
  line: z.number().int().positive().describe("Line number (1-based)"),
  column: z.number().int().positive().describe("Column number (1-based)"),
};

export const diagnosticsInputSchema = {
  file: z.string().optional().describe("Absolute path to a single file"),
  files: z
    .array(z.string())
    .optional()
    .describe("Array of absolute file paths"),
};

export const renameInputSchema = {
  ...fileLocationInputSchema,
  newName: z.string().describe("New name for the symbol"),
};

export const callHierarchyInputSchema = {
  ...fileLocationInputSchema,
  direction: z
    .enum(["incoming", "outgoing", "both"])
    .describe("Direction of call hierarchy"),
};

export interface ServerDependencies {
  provider?: SemanticProvider;
}

export interface ServerOptions {
  outputLimit?: number;
}

export function withInstrumentation<T extends object>(
  toolName: string,
  handler: (input: T) => Promise<CallToolResult>,
): (input: T) => Promise<CallToolResult> {
  return async (input: T) => {
    const start = Date.now();
    const result = await handler(input);
    if (process.env.LSP_MCP_DEBUG) {
      const bytes = result.content
        .filter((c) => c.type === "text")
        .reduce((sum, c) => sum + ((c as { type: "text"; text: string }).text?.length ?? 0), 0);
      process.stderr.write(
        `[lsp-mcp] ${toolName} ${Date.now() - start}ms ${bytes} bytes\n`,
      );
    }
    return result;
  };
}

export function createServer(
  dependencies: ServerDependencies = {},
  options: ServerOptions = {},
): McpServer {
  const provider = dependencies.provider ?? new StaticSemanticProvider();
  const outputLimit = options.outputLimit;
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

  server.registerTool(
    "goto_definition",
    {
      description:
        "Jump to the definition of a symbol (function, variable, type, import). " +
        "Returns the file path and line number where the symbol is defined. " +
        "Positions are 1-based. " +
        "USE THIS INSTEAD OF grep/read when you need to find where a symbol is originally defined. " +
        "Resolves through re-exports, barrel files, and type aliases to the actual source definition. " +
        "Much faster and more accurate than grepping for export statements.",
      inputSchema: fileLocationInputSchema,
    },
    createDefinitionTool(provider),
  );

  server.registerTool(
    "find_references",
    {
      description:
        "Find all usages of a symbol across the project. " +
        "Results include a kind tag per reference (definition, import, type-import, export, jsx, call, reference). " +
        "Default output is a compact summary grouped by file. Use verbose:true for full position list. " +
        "USE THIS INSTEAD OF grep when you need to find all callers, consumers, or importers of a function/type/variable. " +
        "One call replaces all grep/glob/read passes for impact analysis - do not re-read files to classify references, and do not also grep. " +
        "Unlike grep, this understands TypeScript scope, resolves aliases, and finds usages through re-exports. " +
        "Returns complete results - no risk of missing usages due to aliasing, renaming, or multi-line imports.",
      inputSchema: {
        ...fileLocationInputSchema,
        verbose: z
          .boolean()
          .optional()
          .describe(
            "false (default): compact summary with per-file kind counts. true: full position list with kind tags.",
          ),
      },
    },
    withInstrumentation(
      "find_references",
      createReferencesTool(provider, { limit: outputLimit }),
    ),
  );

  server.registerTool(
    "hover",
    {
      description:
        "Get the inferred TypeScript type and JSDoc documentation for a symbol. " +
        "Returns kind (function/variable/class/etc.), full type signature, and docs. " +
        "USE THIS INSTEAD OF reading files when you need to know the type of a variable, " +
        "return type of a function, or resolved generic type parameters. " +
        "This computes the actual resolved type including generics, intersections, mapped types, " +
        "and conditional types - information that CANNOT be determined by reading source text alone. " +
        'Essential for answering "what type is X?" without manually tracing type definitions.',
      inputSchema: fileLocationInputSchema,
    },
    createHoverTool(provider),
  );

  server.registerTool(
    "diagnostics",
    {
      description:
        "Get TypeScript errors and warnings for a file or set of files. " +
        "Includes type errors (TS codes), syntax errors, and suggestions. " +
        "USE THIS to verify code correctness after edits instead of running the full TypeScript compiler. " +
        "WARNING: checking many files sequentially can be slow on large projects. Prefer single-file or targeted file list.",
      inputSchema: diagnosticsInputSchema,
    },
    createDiagnosticsTool(provider),
  );

  server.registerTool(
    "rename",
    {
      description:
        "Find all locations that must change to rename a symbol. " +
        "Returns file paths and positions only - does NOT apply changes automatically. " +
        "Use the Edit tool to apply the rename at each returned location. " +
        "USE THIS INSTEAD OF grep+replace when renaming symbols - it understands scope and " +
        "will not produce false positives from comments, strings, or different-scope variables with the same name.",
      inputSchema: renameInputSchema,
    },
    createRenameTool(provider),
  );

  server.registerTool(
    "call_hierarchy",
    {
      description:
        "Get the directed call graph for a function or method. " +
        "Unlike find_references (which lists all symbol usages including type references, re-exports, and assignments), " +
        "this shows only actual function call relationships with caller/callee direction and container context. " +
        'USE THIS INSTEAD OF grep when tracing "who calls this function" or "what does this function call". ' +
        "Returns structured caller/callee data with container function names - more precise than text search. " +
        'Use "incoming" for callers, "outgoing" for callees, "both" for full graph.',
      inputSchema: callHierarchyInputSchema,
    },
    createCallHierarchyTool(provider),
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

  const roots = resolveWorkspaceRoots({
    roots: configResult.config.roots,
    baseDir: configResult.baseDir,
  });

  const preset = createTypeScriptPreset(
    configResult.config.languages.typescript,
  );
  const manager = new LspSessionManager({
    command: preset.getCommand(),
    roots: roots.roots,
    preset,
  });

  return new LspSemanticProvider({ manager });
}

export async function startStdioServer(): Promise<void> {
  const provider = await createDefaultProvider();
  const configResult = await loadConfig();
  const outputLimit =
    configResult.ok ? configResult.config.output?.defaultLimit : undefined;
  const server = createServer({ provider }, { outputLimit });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function createSetupErrorProvider(message: string): SemanticProvider {
  const setupError: SetupErrorInfo = { message };
  const failedInfo = {
    state: "failed" as const,
    message,
    projectAnchor: "",
    rootPath: "",
    serverCapabilities: [],
  };
  const failedSession = {
    async initialize() {
      return { ...failedInfo };
    },
    getConnection() {
      return undefined;
    },
    getDiagnosticsStore() {
      return undefined;
    },
    async prepareFile() {
      throw new Error("LSP session not ready.");
    },
  };
  const manager = {
    getSummary() {
      return {
        state: "failed" as const,
        message,
        serverCapabilities: [],
      };
    },
    async ensureSession(): Promise<EnsureSessionResult> {
      return { info: { ...failedInfo }, session: failedSession };
    },
  };

  return new LspSemanticProvider({ manager, setupError });
}
