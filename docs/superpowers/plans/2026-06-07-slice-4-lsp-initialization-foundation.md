# Slice 4 LSP Initialization Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start and initialize `typescript-language-server` through real LSP JSON-RPC while keeping semantic tools and document sync out of scope.

**Architecture:** Existing MCP tools continue to call `SemanticProvider`. A new `LspSemanticProvider` delegates active checks to an `LspSessionManager`, which routes a file to a TypeScript project anchor and starts an `LspSession`. The session owns child process startup, JSON-RPC connection setup, `initialize`, `initialized`, capability capture, and failure state.

**Tech Stack:** Node 20, TypeScript ESM, pnpm, official MCP TypeScript SDK, Zod v4, `vscode-jsonrpc@8.2.1`, `vscode-languageserver-protocol@3.17.5`, Vitest, Biome.

---

## File Structure

- Modify `package.json`: add pinned LSP dependencies.
- Modify `pnpm-lock.yaml`: lock pinned LSP dependencies.
- Modify `biome.json`: ignore `.worktrees` so root checks do not inspect nested worktree configs.
- Modify `src/providers/semantic-provider.ts`: add active check request types, setup error type, and live capability summary field.
- Modify `src/providers/static-semantic-provider.ts`: accept optional request arguments without behavior changes.
- Create `src/providers/lsp-semantic-provider.ts`: map setup/session state to provider health and capabilities.
- Create `src/languages/typescript/preset.ts`: TypeScript extension and language ID mapping.
- Create `src/languages/typescript/project-routing.ts`: filesystem-aware project anchor routing.
- Create `src/lsp/types.ts`: shared session, connection, and error types.
- Create `src/lsp/session.ts`: spawn process, create JSON-RPC connection, initialize, capture capabilities.
- Create `src/lsp/session-manager.ts`: cache sessions by project anchor and expose passive/active state.
- Modify `src/tools/health.ts`: accept optional `{ check, file }` input and forward it to provider.
- Modify `src/tools/capabilities.ts`: accept optional `{ check, file }`, forward it, and format live capability names.
- Modify `src/server.ts`: register input schemas, wire provider injection, and construct real provider for stdio startup.
- Modify `README.md`: update status after implementation.
- Modify `docs/superpowers/README.md`: mark Slice 4 plan present.
- Modify `/home/shoutcape/Documents/Obsidian/Projects/lsp-mcp/lsp-mcp Slice 4 LSP Initialization Foundation.md`: record plan path.
- Test `tests/tools/health.test.ts`: request forwarding.
- Test `tests/tools/capabilities.test.ts`: request forwarding and live capability formatting.
- Test `tests/server.test.ts`: MCP input schema forwards arguments to injected provider.
- Test `tests/languages/typescript/preset.test.ts`: extension and language ID mapping.
- Test `tests/languages/typescript/project-routing.test.ts`: marker routing and rejection behavior.
- Test `tests/lsp/session.test.ts`: mocked initialize success and failure behavior.
- Test `tests/lsp/session-manager.test.ts`: cache and passive state behavior.
- Test `tests/providers/lsp-semantic-provider.test.ts`: provider mapping and setup error behavior.

## Task 1: Dependencies, Tool Contracts, And Tool Inputs

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `biome.json`
- Modify: `src/providers/semantic-provider.ts`
- Modify: `src/providers/static-semantic-provider.ts`
- Modify: `src/tools/health.ts`
- Modify: `src/tools/capabilities.ts`
- Modify: `src/server.ts`
- Test: `tests/tools/health.test.ts`
- Test: `tests/tools/capabilities.test.ts`
- Test: `tests/server.test.ts`

- [ ] **Step 1: Write failing health request forwarding test**

Add this test to `tests/tools/health.test.ts`:

```ts
it("forwards active check input to the provider", async () => {
  const seenRequests: unknown[] = [];
  const handler = createHealthTool({
    async getHealth(request) {
      seenRequests.push(request);
      return {
        status: "ready" as const,
        message: "TypeScript LSP initialized.",
      };
    },
    async getCapabilities() {
      throw new Error("not used");
    },
  });

  await expect(
    handler({ check: true, file: "src/index.ts" }),
  ).resolves.toEqual({
    content: [
      {
        type: "text",
        text: [
          "Status: ready",
          "Tool: health",
          "Message: TypeScript LSP initialized.",
        ].join("\n"),
      },
    ],
  });

  expect(seenRequests).toEqual([{ check: true, file: "src/index.ts" }]);
});
```

- [ ] **Step 2: Write failing capabilities live summary test**

Add this test to `tests/tools/capabilities.test.ts`:

```ts
it("formats live server capability names when present", () => {
  expect(
    formatCapabilitiesText({
      status: "ready",
      supportedTools: ["health", "capabilities"],
      lsp: "implemented",
      serverCapabilities: [
        "definitionProvider",
        "hoverProvider",
        "textDocumentSync",
      ],
    }),
  ).toBe(
    [
      "Status: ready",
      "Tool: capabilities",
      "Supported tools: health, capabilities",
      "LSP: implemented",
      "Server capabilities: definitionProvider, hoverProvider, textDocumentSync",
    ].join("\n"),
  );
});

it("forwards active check input to the provider", async () => {
  const seenRequests: unknown[] = [];
  const handler = createCapabilitiesTool({
    async getHealth() {
      throw new Error("not used");
    },
    async getCapabilities(request) {
      seenRequests.push(request);
      return {
        status: "ready" as const,
        supportedTools: ["health", "capabilities"],
        lsp: "implemented" as const,
        serverCapabilities: ["definitionProvider"],
      };
    },
  });

  await expect(
    handler({ check: true, file: "src/index.ts" }),
  ).resolves.toEqual({
    content: [
      {
        type: "text",
        text: [
          "Status: ready",
          "Tool: capabilities",
          "Supported tools: health, capabilities",
          "LSP: implemented",
          "Server capabilities: definitionProvider",
        ].join("\n"),
      },
    ],
  });

  expect(seenRequests).toEqual([{ check: true, file: "src/index.ts" }]);
});
```

- [ ] **Step 3: Write failing MCP argument forwarding test**

Add this test to `tests/server.test.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm test tests/tools/health.test.ts tests/tools/capabilities.test.ts tests/server.test.ts`

Expected: FAIL because handlers currently accept no request argument, `serverCapabilities` does not exist, and MCP tool input schemas are not registered.

- [ ] **Step 5: Add pinned dependencies**

Run: `pnpm add vscode-jsonrpc@8.2.1 vscode-languageserver-protocol@3.17.5 --save-exact`

Expected: `package.json` and `pnpm-lock.yaml` include exact dependency versions.

- [ ] **Step 6: Exclude worktrees from Biome**

Change `biome.json` line 4 to:

```json
"includes": ["**", "!dist", "!node_modules", "!.worktrees"]
```

Expected: root `pnpm check` ignores nested worktree configs.

- [ ] **Step 7: Expand provider contract**

Replace `src/providers/semantic-provider.ts` with this shape:

```ts
export type HealthStatus =
  | "not_started"
  | "starting"
  | "ready"
  | "degraded"
  | "failed";

export interface HealthRequest {
  check?: boolean;
  file?: string;
}

export interface CapabilitiesRequest {
  check?: boolean;
  file?: string;
}

export interface HealthInfo {
  status: HealthStatus;
  message: string;
}

export type LspImplementationState = "not_implemented" | "implemented";

export interface CapabilitiesInfo {
  status: HealthStatus;
  supportedTools: string[];
  lsp: LspImplementationState;
  serverCapabilities?: string[];
}

export interface SetupErrorInfo {
  status: "failed";
  message: string;
}

export interface SemanticProvider {
  getHealth(request?: HealthRequest): Promise<HealthInfo>;
  getCapabilities(request?: CapabilitiesRequest): Promise<CapabilitiesInfo>;
}
```

- [ ] **Step 8: Preserve static provider behavior**

Modify `src/providers/static-semantic-provider.ts` so methods accept ignored optional request arguments:

```ts
import type {
  CapabilitiesInfo,
  CapabilitiesRequest,
  HealthInfo,
  HealthRequest,
  SemanticProvider,
} from "./semantic-provider.js";

export class StaticSemanticProvider implements SemanticProvider {
  async getHealth(_request: HealthRequest = {}): Promise<HealthInfo> {
    return {
      status: "not_started",
      message: "LSP sessions are not implemented in this scaffold.",
    };
  }

  async getCapabilities(
    _request: CapabilitiesRequest = {},
  ): Promise<CapabilitiesInfo> {
    return {
      status: "ready",
      supportedTools: ["health", "capabilities"],
      lsp: "not_implemented",
    };
  }
}
```

- [ ] **Step 9: Update health tool input handling**

Modify `src/tools/health.ts`:

```ts
import { z } from "zod";

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type {
  HealthInfo,
  HealthRequest,
  SemanticProvider,
} from "../providers/semantic-provider.js";
import { StaticSemanticProvider } from "../providers/static-semantic-provider.js";
import { textResult } from "./text-result.js";

export const healthToolInputSchema = {
  check: z.boolean().optional(),
  file: z.string().optional(),
};

export function formatHealthText(health: HealthInfo): string {
  return [
    `Status: ${health.status}`,
    "Tool: health",
    `Message: ${health.message}`,
  ].join("\n");
}

export function createHealthTool(provider: SemanticProvider) {
  return async function getHealthResult(
    request: HealthRequest = {},
  ): Promise<CallToolResult> {
    return textResult(formatHealthText(await provider.getHealth(request)));
  };
}

export function getHealthText(): string {
  return formatHealthText({
    status: "not_started",
    message: "LSP sessions are not implemented in this scaffold.",
  });
}

export const getHealthResult = createHealthTool(new StaticSemanticProvider());
```

- [ ] **Step 10: Update capabilities tool input handling**

Modify `src/tools/capabilities.ts`:

```ts
import { z } from "zod";

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type {
  CapabilitiesInfo,
  CapabilitiesRequest,
  SemanticProvider,
} from "../providers/semantic-provider.js";
import { StaticSemanticProvider } from "../providers/static-semantic-provider.js";
import { textResult } from "./text-result.js";

export const capabilitiesToolInputSchema = {
  check: z.boolean().optional(),
  file: z.string().optional(),
};

function formatLspState(lsp: CapabilitiesInfo["lsp"]): string {
  return lsp.replace("_", " ");
}

export function formatCapabilitiesText(capabilities: CapabilitiesInfo): string {
  const lines = [
    `Status: ${capabilities.status}`,
    "Tool: capabilities",
    `Supported tools: ${capabilities.supportedTools.join(", ")}`,
    `LSP: ${formatLspState(capabilities.lsp)}`,
  ];

  if (capabilities.serverCapabilities?.length) {
    lines.push(
      `Server capabilities: ${capabilities.serverCapabilities.join(", ")}`,
    );
  }

  return lines.join("\n");
}

export function createCapabilitiesTool(provider: SemanticProvider) {
  return async function getCapabilitiesResult(
    request: CapabilitiesRequest = {},
  ): Promise<CallToolResult> {
    return textResult(
      formatCapabilitiesText(await provider.getCapabilities(request)),
    );
  };
}

export function getCapabilitiesText(): string {
  return formatCapabilitiesText({
    status: "ready",
    supportedTools: ["health", "capabilities"],
    lsp: "not_implemented",
  });
}

export const getCapabilitiesResult = createCapabilitiesTool(
  new StaticSemanticProvider(),
);
```

- [ ] **Step 11: Register MCP tool input schemas**

Modify imports and registrations in `src/server.ts`:

```ts
import {
  capabilitiesToolInputSchema,
  createCapabilitiesTool,
} from "./tools/capabilities.js";
import { createHealthTool, healthToolInputSchema } from "./tools/health.js";
```

Use these registration configs:

```ts
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
    description: "List MCP and language-server capabilities.",
    inputSchema: capabilitiesToolInputSchema,
  },
  createCapabilitiesTool(provider),
);
```

- [ ] **Step 12: Verify Task 1 tests pass**

Run: `pnpm test tests/tools/health.test.ts tests/tools/capabilities.test.ts tests/server.test.ts`

Expected: PASS.

## Task 2: TypeScript Preset And Project Routing

**Files:**
- Create: `src/languages/typescript/preset.ts`
- Create: `src/languages/typescript/project-routing.ts`
- Test: `tests/languages/typescript/preset.test.ts`
- Test: `tests/languages/typescript/project-routing.test.ts`

- [ ] **Step 1: Write failing TypeScript preset tests**

Create `tests/languages/typescript/preset.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { defaultConfig } from "../../../src/config/config.js";
import { createTypeScriptPreset } from "../../../src/languages/typescript/preset.js";

describe("TypeScript preset", () => {
  it("maps configured TypeScript and JavaScript extensions to language IDs", () => {
    const preset = createTypeScriptPreset(
      defaultConfig.languages.typescript,
    );

    expect(preset.languageIdForPath("src/index.ts")).toBe("typescript");
    expect(preset.languageIdForPath("src/index.mts")).toBe("typescript");
    expect(preset.languageIdForPath("src/index.cts")).toBe("typescript");
    expect(preset.languageIdForPath("src/App.tsx")).toBe("typescriptreact");
    expect(preset.languageIdForPath("src/index.js")).toBe("javascript");
    expect(preset.languageIdForPath("src/index.mjs")).toBe("javascript");
    expect(preset.languageIdForPath("src/index.cjs")).toBe("javascript");
    expect(preset.languageIdForPath("src/App.jsx")).toBe("javascriptreact");
  });

  it("rejects extensions removed from config", () => {
    const preset = createTypeScriptPreset({
      ...defaultConfig.languages.typescript,
      extensions: [".ts"],
    });

    expect(preset.isSupportedFile("src/index.ts")).toBe(true);
    expect(preset.isSupportedFile("src/App.tsx")).toBe(false);
    expect(preset.languageIdForPath("src/App.tsx")).toBeUndefined();
  });

  it("returns cloned command and project marker arrays", () => {
    const preset = createTypeScriptPreset(
      defaultConfig.languages.typescript,
    );

    const command = preset.getCommand();
    const markers = preset.getProjectMarkers();

    command.push("mutated");
    markers.push("mutated.json");

    expect(preset.getCommand()).toEqual([
      "typescript-language-server",
      "--stdio",
    ]);
    expect(preset.getProjectMarkers()).toEqual([
      "tsconfig.json",
      "package.json",
    ]);
  });
});
```

- [ ] **Step 2: Write failing project routing tests**

Create `tests/languages/typescript/project-routing.test.ts`:

```ts
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { defaultConfig } from "../../../src/config/config.js";
import { createTypeScriptPreset } from "../../../src/languages/typescript/preset.js";
import { routeTypeScriptProject } from "../../../src/languages/typescript/project-routing.js";

async function makeTempRoot(): Promise<string> {
  return await mkdtemp(path.join(os.tmpdir(), "lsp-mcp-route-"));
}

describe("TypeScript project routing", () => {
  it("uses nearest tsconfig.json as project anchor", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "packages/app/src"), { recursive: true });
    await writeFile(path.join(root, "package.json"), "{}", "utf8");
    await writeFile(path.join(root, "packages/app/tsconfig.json"), "{}", "utf8");

    const result = await routeTypeScriptProject({
      requestedPath: "packages/app/src/index.ts",
      roots: [{ path: root }],
      preset: createTypeScriptPreset(defaultConfig.languages.typescript),
    });

    expect(result).toEqual({
      ok: true,
      filePath: path.join(root, "packages/app/src/index.ts"),
      root: { path: root },
      projectAnchor: path.join(root, "packages/app"),
      languageId: "typescript",
    });
  });

  it("falls back to nearest package.json", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "packages/app/src"), { recursive: true });
    await writeFile(path.join(root, "packages/app/package.json"), "{}", "utf8");

    const result = await routeTypeScriptProject({
      requestedPath: "packages/app/src/index.ts",
      roots: [{ path: root }],
      preset: createTypeScriptPreset(defaultConfig.languages.typescript),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.projectAnchor).toBe(path.join(root, "packages/app"));
    }
  });

  it("falls back to owning root when no markers exist", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "src"), { recursive: true });

    const result = await routeTypeScriptProject({
      requestedPath: "src/index.ts",
      roots: [{ path: root }],
      preset: createTypeScriptPreset(defaultConfig.languages.typescript),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.projectAnchor).toBe(root);
    }
  });

  it("rejects unsupported file extensions before marker checks", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "src"), { recursive: true });

    const result = await routeTypeScriptProject({
      requestedPath: "src/readme.md",
      roots: [{ path: root }],
      preset: createTypeScriptPreset(defaultConfig.languages.typescript),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "unsupported_file_type",
        message: "Unsupported TypeScript file extension: src/readme.md",
      },
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test tests/languages/typescript/preset.test.ts tests/languages/typescript/project-routing.test.ts`

Expected: FAIL because TypeScript preset and routing files do not exist.

- [ ] **Step 4: Implement TypeScript preset**

Create `src/languages/typescript/preset.ts`:

```ts
import path from "node:path";

import type { TypeScriptLanguageConfig } from "../../config/config.js";

export interface TypeScriptPreset {
  languageIdForPath(filePath: string): string | undefined;
  isSupportedFile(filePath: string): boolean;
  getCommand(): string[];
  getProjectMarkers(): string[];
}

const defaultLanguageIds = new Map<string, string>([
  [".ts", "typescript"],
  [".mts", "typescript"],
  [".cts", "typescript"],
  [".tsx", "typescriptreact"],
  [".js", "javascript"],
  [".mjs", "javascript"],
  [".cjs", "javascript"],
  [".jsx", "javascriptreact"],
]);

export function createTypeScriptPreset(
  config: TypeScriptLanguageConfig,
): TypeScriptPreset {
  const configuredExtensions = new Set(config.extensions);
  const command = [...config.command];
  const projectMarkers = [...config.projectMarkers];

  return {
    languageIdForPath(filePath) {
      const extension = path.extname(filePath);

      if (!configuredExtensions.has(extension)) {
        return undefined;
      }

      return defaultLanguageIds.get(extension);
    },
    isSupportedFile(filePath) {
      return this.languageIdForPath(filePath) !== undefined;
    },
    getCommand() {
      return [...command];
    },
    getProjectMarkers() {
      return [...projectMarkers];
    },
  };
}
```

- [ ] **Step 5: Implement project routing**

Create `src/languages/typescript/project-routing.ts`:

```ts
import { stat } from "node:fs/promises";
import path from "node:path";

import { resolveSafePath } from "../../safety/path-safety.js";
import type { WorkspaceRoot } from "../../workspace/roots.js";
import type { TypeScriptPreset } from "./preset.js";

export type TypeScriptProjectRouteErrorCode =
  | "no_workspace_roots"
  | "empty_path"
  | "path_outside_workspace"
  | "unsupported_file_type"
  | "project_route_error";

export interface TypeScriptProjectRouteError {
  code: TypeScriptProjectRouteErrorCode;
  message: string;
}

export interface TypeScriptProjectRouteOptions {
  requestedPath: string;
  roots: WorkspaceRoot[];
  preset: TypeScriptPreset;
}

export interface TypeScriptProjectRoute {
  filePath: string;
  root: WorkspaceRoot;
  projectAnchor: string;
  languageId: string;
}

export type TypeScriptProjectRouteResult =
  | ({ ok: true } & TypeScriptProjectRoute)
  | { ok: false; error: TypeScriptProjectRouteError };

export async function routeTypeScriptProject(
  options: TypeScriptProjectRouteOptions,
): Promise<TypeScriptProjectRouteResult> {
  const languageId = options.preset.languageIdForPath(options.requestedPath);

  if (languageId === undefined) {
    return {
      ok: false,
      error: {
        code: "unsupported_file_type",
        message: `Unsupported TypeScript file extension: ${options.requestedPath}`,
      },
    };
  }

  const safePath = resolveSafePath({
    requestedPath: options.requestedPath,
    roots: options.roots,
  });

  if (!safePath.ok) {
    return { ok: false, error: safePath.error };
  }

  try {
    const projectAnchor = await findProjectAnchor({
      filePath: safePath.path,
      rootPath: safePath.root.path,
      markers: options.preset.getProjectMarkers(),
    });

    return {
      ok: true,
      filePath: safePath.path,
      root: safePath.root,
      projectAnchor,
      languageId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      ok: false,
      error: {
        code: "project_route_error",
        message: `Unable to route TypeScript project: ${message}`,
      },
    };
  }
}

async function findProjectAnchor(options: {
  filePath: string;
  rootPath: string;
  markers: string[];
}): Promise<string> {
  const rootPath = path.normalize(options.rootPath);
  let currentDir = path.dirname(options.filePath);

  while (isPathInsideOrEqual(currentDir, rootPath)) {
    for (const marker of options.markers) {
      if (await fileExists(path.join(currentDir, marker))) {
        return currentDir;
      }
    }

    if (currentDir === rootPath) {
      return rootPath;
    }

    currentDir = path.dirname(currentDir);
  }

  return rootPath;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    return stats.isFile();
  } catch (error) {
    if (isNotFoundError(error)) {
      return false;
    }

    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function isPathInsideOrEqual(candidatePath: string, rootPath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);

  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}
```

- [ ] **Step 6: Fix temp directory helper if the first draft is awkward**

Use this final helper in `tests/languages/typescript/project-routing.test.ts`:

```ts
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function makeTempRoot(): Promise<string> {
  return await mkdtemp(path.join(os.tmpdir(), "lsp-mcp-route-"));
}
```

Expected: tests use isolated temp roots and do not depend on fixed paths.

- [ ] **Step 7: Verify Task 2 tests pass**

Run: `pnpm test tests/languages/typescript/preset.test.ts tests/languages/typescript/project-routing.test.ts`

Expected: PASS.

## Task 3: LSP Session Initialization

**Files:**
- Create: `src/lsp/types.ts`
- Create: `src/lsp/session.ts`
- Test: `tests/lsp/session.test.ts`

- [ ] **Step 1: Write failing session tests**

Create `tests/lsp/session.test.ts`:

```ts
import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { LspSession } from "../../src/lsp/session.js";
import type {
  LspConnection,
  LspConnectionFactory,
  LspProcess,
} from "../../src/lsp/types.js";

function createMockConnection(): LspConnection {
  return {
    listen: vi.fn(),
    sendRequest: vi.fn().mockResolvedValue({
      capabilities: {
        definitionProvider: true,
        hoverProvider: true,
        textDocumentSync: 1,
      },
    }),
    sendNotification: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  };
}

function createMockProcess(): LspProcess {
  const emitter = new EventEmitter();
  return {
    pid: 1234,
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    kill: vi.fn().mockReturnValue(true),
  };
}

describe("LspSession", () => {
  it("initializes an LSP connection and stores capability names", async () => {
    const connection = createMockConnection();
    const process = createMockProcess();
    const factory: LspConnectionFactory = vi.fn().mockResolvedValue({
      process,
      connection,
    });

    const session = new LspSession({
      command: ["typescript-language-server", "--stdio"],
      projectAnchor: "/workspace/app",
      rootPath: "/workspace",
      connectionFactory: factory,
    });

    const result = await session.initialize();

    expect(result).toEqual({
      state: "ready",
      message: "TypeScript LSP initialized.",
      projectAnchor: "/workspace/app",
      rootPath: "/workspace",
      serverCapabilities: [
        "definitionProvider",
        "hoverProvider",
        "textDocumentSync",
      ],
    });
    expect(factory).toHaveBeenCalledWith({
      command: "typescript-language-server",
      args: ["--stdio"],
      cwd: "/workspace/app",
    });
    expect(connection.listen).toHaveBeenCalledTimes(1);
    expect(connection.sendRequest).toHaveBeenCalledTimes(1);
    expect(connection.sendNotification).toHaveBeenCalledTimes(1);
  });

  it("fails without spawning when command is empty", async () => {
    const factory: LspConnectionFactory = vi.fn();
    const session = new LspSession({
      command: [],
      projectAnchor: "/workspace/app",
      rootPath: "/workspace",
      connectionFactory: factory,
    });

    await expect(session.initialize()).resolves.toEqual({
      state: "failed",
      message: "Unable to initialize TypeScript LSP: language server command is empty.",
      projectAnchor: "/workspace/app",
      rootPath: "/workspace",
      serverCapabilities: [],
    });
    expect(factory).not.toHaveBeenCalled();
  });

  it("records initialize failures", async () => {
    const connection = createMockConnection();
    vi.mocked(connection.sendRequest).mockRejectedValueOnce(
      new Error("initialize failed"),
    );
    const factory: LspConnectionFactory = vi.fn().mockResolvedValue({
      process: createMockProcess(),
      connection,
    });
    const session = new LspSession({
      command: ["typescript-language-server", "--stdio"],
      projectAnchor: "/workspace/app",
      rootPath: "/workspace",
      connectionFactory: factory,
    });

    await expect(session.initialize()).resolves.toEqual({
      state: "failed",
      message: "Unable to initialize TypeScript LSP: initialize failed",
      projectAnchor: "/workspace/app",
      rootPath: "/workspace",
      serverCapabilities: [],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/lsp/session.test.ts`

Expected: FAIL because LSP session files do not exist.

- [ ] **Step 3: Add LSP shared types**

Create `src/lsp/types.ts`:

```ts
import type { ServerCapabilities } from "vscode-languageserver-protocol";

export type LspSessionState = "not_started" | "starting" | "ready" | "failed";

export interface LspProcess {
  pid?: number;
  on(event: "exit", listener: (code: number | null, signal: string | null) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  once(event: "exit", listener: (code: number | null, signal: string | null) => void): void;
  once(event: "error", listener: (error: Error) => void): void;
  kill(): boolean;
}

export interface LspConnection {
  listen(): void;
  sendRequest(method: unknown, params: unknown): Promise<unknown>;
  sendNotification(method: unknown, params?: unknown): Promise<void>;
  dispose(): void;
}

export interface LspConnectionFactoryOptions {
  command: string;
  args: string[];
  cwd: string;
}

export interface LspConnectionFactoryResult {
  process: LspProcess;
  connection: LspConnection;
}

export type LspConnectionFactory = (
  options: LspConnectionFactoryOptions,
) => Promise<LspConnectionFactoryResult>;

export interface LspSessionInfo {
  state: LspSessionState;
  message: string;
  projectAnchor: string;
  rootPath: string;
  serverCapabilities: string[];
  rawServerCapabilities?: ServerCapabilities;
}
```

- [ ] **Step 4: Implement LSP session**

Create `src/lsp/session.ts`:

```ts
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node.js";
import {
  InitializedNotification,
  InitializeRequest,
  type InitializeResult,
  type ServerCapabilities,
} from "vscode-languageserver-protocol";

import type {
  LspConnectionFactory,
  LspConnectionFactoryOptions,
  LspConnectionFactoryResult,
  LspSessionInfo,
} from "./types.js";

export interface LspSessionOptions {
  command: string[];
  projectAnchor: string;
  rootPath: string;
  connectionFactory?: LspConnectionFactory;
}

export class LspSession {
  private info: LspSessionInfo;
  private readonly command: string[];
  private readonly connectionFactory: LspConnectionFactory;

  constructor(options: LspSessionOptions) {
    this.command = [...options.command];
    this.connectionFactory = options.connectionFactory ?? createNodeLspConnection;
    this.info = {
      state: "not_started",
      message: "TypeScript LSP session has not started.",
      projectAnchor: options.projectAnchor,
      rootPath: options.rootPath,
      serverCapabilities: [],
    };
  }

  getInfo(): LspSessionInfo {
    return { ...this.info, serverCapabilities: [...this.info.serverCapabilities] };
  }

  async initialize(): Promise<LspSessionInfo> {
    if (this.info.state === "ready") {
      return this.getInfo();
    }

    if (this.command.length === 0 || this.command[0]?.trim() === "") {
      return this.markFailed("language server command is empty.");
    }

    this.info = {
      ...this.info,
      state: "starting",
      message: "Starting TypeScript LSP.",
    };

    try {
      const [command, ...args] = this.command;
      const { process, connection } = await this.connectionFactory({
        command,
        args,
        cwd: this.info.projectAnchor,
      });

      const startupError = new Promise<never>((_resolve, reject) => {
        process.once("error", reject);
      });

      connection.listen();

      const initializeResult = (await Promise.race([
        connection.sendRequest(InitializeRequest.type, {
          processId: process.pid ?? null,
          rootUri: pathToFileURL(this.info.projectAnchor).toString(),
          workspaceFolders: [
            {
              name: "workspace",
              uri: pathToFileURL(this.info.rootPath).toString(),
            },
          ],
          capabilities: {},
        }),
        startupError,
      ])) as InitializeResult;

      await connection.sendNotification(InitializedNotification.type, {});

      this.info = {
        ...this.info,
        state: "ready",
        message: "TypeScript LSP initialized.",
        rawServerCapabilities: initializeResult.capabilities,
        serverCapabilities: summarizeServerCapabilities(
          initializeResult.capabilities,
        ),
      };

      process.once("exit", (code, signal) => {
        this.info = {
          ...this.info,
          state: "failed",
          message: `TypeScript LSP exited with code ${code ?? "null"} and signal ${signal ?? "null"}.`,
        };
      });

      return this.getInfo();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.markFailed(message);
    }
  }

  private markFailed(reason: string): LspSessionInfo {
    this.info = {
      ...this.info,
      state: "failed",
      message: `Unable to initialize TypeScript LSP: ${reason}`,
      serverCapabilities: [],
    };

    return this.getInfo();
  }
}

export async function createNodeLspConnection(
  options: LspConnectionFactoryOptions,
): Promise<LspConnectionFactoryResult> {
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const connection = createMessageConnection(
    new StreamMessageReader(child.stdout),
    new StreamMessageWriter(child.stdin),
  );

  return { process: child, connection };
}

export function summarizeServerCapabilities(
  capabilities: ServerCapabilities,
): string[] {
  return Object.entries(capabilities)
    .filter(([_name, value]) => value !== undefined && value !== false)
    .map(([name]) => name)
    .sort();
}
```

- [ ] **Step 5: Verify Task 3 tests pass**

Run: `pnpm test tests/lsp/session.test.ts`

Expected: PASS.

## Task 4: LSP Session Manager

**Files:**
- Create: `src/lsp/session-manager.ts`
- Test: `tests/lsp/session-manager.test.ts`

- [ ] **Step 1: Write failing session manager tests**

Create `tests/lsp/session-manager.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createTypeScriptPreset } from "../../src/languages/typescript/preset.js";
import { LspSessionManager } from "../../src/lsp/session-manager.js";
import type { LspSessionInfo } from "../../src/lsp/types.js";

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
      command: ["typescript-language-server", "--stdio"],
      roots: [{ path: "/workspace" }],
      preset: createTypeScriptPreset({
        enabled: true,
        command: ["typescript-language-server", "--stdio"],
        extensions: [".ts"],
        projectMarkers: ["tsconfig.json", "package.json"],
      }),
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
    const sessionFactory = vi.fn().mockReturnValue({ initialize });
    const manager = new LspSessionManager({
      command: ["typescript-language-server", "--stdio"],
      roots: [{ path: "/workspace" }],
      preset: createTypeScriptPreset({
        enabled: true,
        command: ["typescript-language-server", "--stdio"],
        extensions: [".ts"],
        projectMarkers: ["tsconfig.json", "package.json"],
      }),
      routeProject: vi.fn().mockResolvedValue({
        ok: true,
        filePath: "/workspace/app/src/index.ts",
        root: { path: "/workspace" },
        projectAnchor: "/workspace/app",
        languageId: "typescript",
      }),
      sessionFactory,
    });

    await expect(manager.ensureSession("app/src/index.ts")).resolves.toEqual(
      readyInfo,
    );
    await expect(manager.ensureSession("app/src/index.ts")).resolves.toEqual(
      readyInfo,
    );

    expect(sessionFactory).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledTimes(2);
  });

  it("returns failed info when routing fails", async () => {
    const manager = new LspSessionManager({
      command: ["typescript-language-server", "--stdio"],
      roots: [{ path: "/workspace" }],
      preset: createTypeScriptPreset({
        enabled: true,
        command: ["typescript-language-server", "--stdio"],
        extensions: [".ts"],
        projectMarkers: ["tsconfig.json", "package.json"],
      }),
      routeProject: vi.fn().mockResolvedValue({
        ok: false,
        error: {
          code: "unsupported_file_type",
          message: "Unsupported TypeScript file extension: README.md",
        },
      }),
      sessionFactory: vi.fn(),
    });

    await expect(manager.ensureSession("README.md")).resolves.toEqual({
      state: "failed",
      message: "Unsupported TypeScript file extension: README.md",
      projectAnchor: "",
      rootPath: "",
      serverCapabilities: [],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/lsp/session-manager.test.ts`

Expected: FAIL because `src/lsp/session-manager.ts` does not exist.

- [ ] **Step 3: Implement session manager**

Create `src/lsp/session-manager.ts`:

```ts
import type { WorkspaceRoot } from "../workspace/roots.js";
import type { TypeScriptPreset } from "../languages/typescript/preset.js";
import {
  routeTypeScriptProject,
  type TypeScriptProjectRouteResult,
} from "../languages/typescript/project-routing.js";
import { LspSession } from "./session.js";
import type { LspSessionInfo } from "./types.js";

export interface LspSessionLike {
  initialize(): Promise<LspSessionInfo>;
}

export interface LspSessionManagerSummary {
  state: LspSessionInfo["state"];
  message: string;
  serverCapabilities: string[];
}

export interface LspSessionManagerOptions {
  command: string[];
  roots: WorkspaceRoot[];
  preset: TypeScriptPreset;
  routeProject?: (options: {
    requestedPath: string;
    roots: WorkspaceRoot[];
    preset: TypeScriptPreset;
  }) => Promise<TypeScriptProjectRouteResult>;
  sessionFactory?: (options: {
    command: string[];
    projectAnchor: string;
    rootPath: string;
  }) => LspSessionLike;
}

export class LspSessionManager {
  private readonly command: string[];
  private readonly roots: WorkspaceRoot[];
  private readonly preset: TypeScriptPreset;
  private readonly routeProject: NonNullable<LspSessionManagerOptions["routeProject"]>;
  private readonly sessionFactory: NonNullable<LspSessionManagerOptions["sessionFactory"]>;
  private readonly sessions = new Map<string, LspSessionLike>();
  private lastInfo: LspSessionInfo | undefined;

  constructor(options: LspSessionManagerOptions) {
    this.command = [...options.command];
    this.roots = options.roots;
    this.preset = options.preset;
    this.routeProject = options.routeProject ?? routeTypeScriptProject;
    this.sessionFactory =
      options.sessionFactory ??
      ((sessionOptions) => new LspSession(sessionOptions));
  }

  getSummary(): LspSessionManagerSummary {
    if (this.lastInfo === undefined) {
      return {
        state: "not_started",
        message: "TypeScript LSP sessions are not started.",
        serverCapabilities: [],
      };
    }

    return {
      state: this.lastInfo.state,
      message: this.lastInfo.message,
      serverCapabilities: [...this.lastInfo.serverCapabilities],
    };
  }

  async ensureSession(requestedPath: string): Promise<LspSessionInfo> {
    const route = await this.routeProject({
      requestedPath,
      roots: this.roots,
      preset: this.preset,
    });

    if (!route.ok) {
      this.lastInfo = {
        state: "failed",
        message: route.error.message,
        projectAnchor: "",
        rootPath: "",
        serverCapabilities: [],
      };
      return this.lastInfo;
    }

    const existing = this.sessions.get(route.projectAnchor);
    const session =
      existing ??
      this.sessionFactory({
        command: this.command,
        projectAnchor: route.projectAnchor,
        rootPath: route.root.path,
      });

    if (existing === undefined) {
      this.sessions.set(route.projectAnchor, session);
    }

    this.lastInfo = await session.initialize();
    return this.lastInfo;
  }
}
```

- [ ] **Step 4: Verify Task 4 tests pass**

Run: `pnpm test tests/lsp/session-manager.test.ts`

Expected: PASS.

## Task 5: LSP Semantic Provider And Server Startup Wiring

**Files:**
- Create: `src/providers/lsp-semantic-provider.ts`
- Modify: `src/server.ts`
- Test: `tests/providers/lsp-semantic-provider.test.ts`
- Test: `tests/server.test.ts`

- [ ] **Step 1: Write failing LSP provider tests**

Create `tests/providers/lsp-semantic-provider.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { LspSemanticProvider } from "../../src/providers/lsp-semantic-provider.js";

describe("LspSemanticProvider", () => {
  it("reports passive health without starting a session", async () => {
    const manager = {
      getSummary: vi.fn().mockReturnValue({
        state: "not_started",
        message: "TypeScript LSP sessions are not started.",
        serverCapabilities: [],
      }),
      ensureSession: vi.fn(),
    };
    const provider = new LspSemanticProvider({ manager });

    await expect(provider.getHealth()).resolves.toEqual({
      status: "not_started",
      message: "TypeScript LSP sessions are not started.",
    });
    expect(manager.ensureSession).not.toHaveBeenCalled();
  });

  it("requires file input for active health checks", async () => {
    const provider = new LspSemanticProvider({
      manager: {
        getSummary: vi.fn(),
        ensureSession: vi.fn(),
      },
    });

    await expect(provider.getHealth({ check: true })).resolves.toEqual({
      status: "failed",
      message: "Active TypeScript LSP checks require a file path.",
    });
  });

  it("starts a session for active health checks", async () => {
    const manager = {
      getSummary: vi.fn(),
      ensureSession: vi.fn().mockResolvedValue({
        state: "ready",
        message: "TypeScript LSP initialized.",
        projectAnchor: "/workspace/app",
        rootPath: "/workspace",
        serverCapabilities: ["definitionProvider"],
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
    const manager = {
      getSummary: vi.fn(),
      ensureSession: vi.fn().mockResolvedValue({
        state: "ready",
        message: "TypeScript LSP initialized.",
        projectAnchor: "/workspace/app",
        rootPath: "/workspace",
        serverCapabilities: ["definitionProvider", "hoverProvider"],
      }),
    };
    const provider = new LspSemanticProvider({ manager });

    await expect(
      provider.getCapabilities({ check: true, file: "src/index.ts" }),
    ).resolves.toEqual({
      status: "ready",
      supportedTools: ["health", "capabilities"],
      lsp: "implemented",
      serverCapabilities: ["definitionProvider", "hoverProvider"],
    });
  });

  it("surfaces initial setup errors", async () => {
    const provider = new LspSemanticProvider({
      setupError: {
        status: "failed",
        message: "No workspace roots configured.",
      },
      manager: {
        getSummary: vi.fn(),
        ensureSession: vi.fn(),
      },
    });

    await expect(provider.getHealth()).resolves.toEqual({
      status: "failed",
      message: "No workspace roots configured.",
    });
  });
});
```

- [ ] **Step 2: Run provider test to verify it fails**

Run: `pnpm test tests/providers/lsp-semantic-provider.test.ts`

Expected: FAIL because provider file does not exist.

- [ ] **Step 3: Implement LSP semantic provider**

Create `src/providers/lsp-semantic-provider.ts`:

```ts
import type { LspSessionManager } from "../lsp/session-manager.js";
import type {
  CapabilitiesInfo,
  CapabilitiesRequest,
  HealthInfo,
  HealthRequest,
  SemanticProvider,
  SetupErrorInfo,
} from "./semantic-provider.js";

export interface LspProviderSessionManager {
  getSummary(): {
    state: HealthInfo["status"];
    message: string;
    serverCapabilities: string[];
  };
  ensureSession(file: string): Promise<{
    state: HealthInfo["status"];
    message: string;
    serverCapabilities: string[];
  }>;
}

export interface LspSemanticProviderOptions {
  manager: LspProviderSessionManager | LspSessionManager;
  setupError?: SetupErrorInfo;
}

export class LspSemanticProvider implements SemanticProvider {
  private readonly manager: LspProviderSessionManager;
  private readonly setupError: SetupErrorInfo | undefined;

  constructor(options: LspSemanticProviderOptions) {
    this.manager = options.manager;
    this.setupError = options.setupError;
  }

  async getHealth(request: HealthRequest = {}): Promise<HealthInfo> {
    if (this.setupError !== undefined) {
      return this.setupError;
    }

    if (!request.check) {
      const summary = this.manager.getSummary();
      return { status: summary.state, message: summary.message };
    }

    if (request.file === undefined || request.file.trim() === "") {
      return {
        status: "failed",
        message: "Active TypeScript LSP checks require a file path.",
      };
    }

    const session = await this.manager.ensureSession(request.file);
    return { status: session.state, message: session.message };
  }

  async getCapabilities(
    request: CapabilitiesRequest = {},
  ): Promise<CapabilitiesInfo> {
    if (this.setupError !== undefined) {
      return {
        status: this.setupError.status,
        supportedTools: ["health", "capabilities"],
        lsp: "implemented",
      };
    }

    if (!request.check) {
      const summary = this.manager.getSummary();
      return {
        status: summary.state,
        supportedTools: ["health", "capabilities"],
        lsp: "implemented",
        serverCapabilities: summary.serverCapabilities,
      };
    }

    if (request.file === undefined || request.file.trim() === "") {
      return {
        status: "failed",
        supportedTools: ["health", "capabilities"],
        lsp: "implemented",
      };
    }

    const session = await this.manager.ensureSession(request.file);
    return {
      status: session.state,
      supportedTools: ["health", "capabilities"],
      lsp: "implemented",
      serverCapabilities: session.serverCapabilities,
    };
  }
}
```

- [ ] **Step 4: Wire real provider in stdio server startup**

Modify `src/server.ts` to import config, roots, preset, manager, and provider:

```ts
import { loadConfig } from "./config/load-config.js";
import { createTypeScriptPreset } from "./languages/typescript/preset.js";
import { LspSessionManager } from "./lsp/session-manager.js";
import { LspSemanticProvider } from "./providers/lsp-semantic-provider.js";
import type {
  SemanticProvider,
  SetupErrorInfo,
} from "./providers/semantic-provider.js";
import { resolveWorkspaceRoots } from "./workspace/resolve-roots.js";
```

Replace `startStdioServer()` with:

```ts
export async function startStdioServer(): Promise<void> {
  const provider = await createDefaultProvider();
  const server = createServer({ provider });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

Add helper below `startStdioServer()`:

```ts
async function createDefaultProvider(): Promise<SemanticProvider> {
  const configResult = await loadConfig();

  if (!configResult.ok) {
    return createSetupErrorProvider(configResult.error.message);
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

function createSetupErrorProvider(message: string): SemanticProvider {
  const setupError: SetupErrorInfo = { status: "failed", message };

  return new LspSemanticProvider({
    setupError,
    manager: {
      getSummary() {
        return {
          state: "failed",
          message,
          serverCapabilities: [],
        };
      },
      async ensureSession() {
        return {
          state: "failed",
          message,
          projectAnchor: "",
          rootPath: "",
          serverCapabilities: [],
        };
      },
    },
  });
}
```

- [ ] **Step 5: Verify provider and server tests pass**

Run: `pnpm test tests/providers/lsp-semantic-provider.test.ts tests/server.test.ts`

Expected: PASS.

## Task 6: Documentation And Full Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/README.md`
- Modify: `/home/shoutcape/Documents/Obsidian/Projects/lsp-mcp/lsp-mcp Slice 4 LSP Initialization Foundation.md`

- [ ] **Step 1: Update README status**

Change `README.md` status paragraph to:

```md
Slice 4 LSP initialization foundation is implemented. The MCP stdio server can load config, resolve explicit workspace roots, route TypeScript and JavaScript files to project anchors, start `typescript-language-server`, initialize it over LSP JSON-RPC, and report live state through active `health` and `capabilities` checks. Semantic tools such as `diagnostics`, `hover`, and `definition` remain future work.
```

- [ ] **Step 2: Update slice docs index**

In `docs/superpowers/README.md`, change Current Slice to:

```md
Slice 4 LSP initialization foundation is implemented. First semantic tools remain future work.
```

Change Slice 4 row to:

```md
| Slice 4 LSP Initialization Foundation | Implemented | [spec](specs/2026-06-07-slice-4-lsp-initialization-foundation-design.md) | [plan](plans/2026-06-07-slice-4-lsp-initialization-foundation.md) | `Projects/lsp-mcp/lsp-mcp Slice 4 LSP Initialization Foundation.md` |
```

- [ ] **Step 3: Update Obsidian Slice 4 note**

In `/home/shoutcape/Documents/Obsidian/Projects/lsp-mcp/lsp-mcp Slice 4 LSP Initialization Foundation.md`, change frontmatter status to:

```yaml
status: implemented
```

Change repo documentation section to:

```md
## Repo Documentation

- Spec: `docs/superpowers/specs/2026-06-07-slice-4-lsp-initialization-foundation-design.md`
- Plan: `docs/superpowers/plans/2026-06-07-slice-4-lsp-initialization-foundation.md`
- Index: `docs/superpowers/README.md`
```

Add implementation result before Next Slice:

```md
## Implementation Result

Slice 4 is implemented in the repo. The server can initialize TypeScript LSP sessions for configured roots during active health and capabilities checks. Semantic requests and document sync remain future work.
```

- [ ] **Step 4: Run targeted tests**

Run: `pnpm test tests/tools/health.test.ts tests/tools/capabilities.test.ts tests/server.test.ts tests/languages/typescript/preset.test.ts tests/languages/typescript/project-routing.test.ts tests/lsp/session.test.ts tests/lsp/session-manager.test.ts tests/providers/lsp-semantic-provider.test.ts`

Expected: PASS.

- [ ] **Step 5: Run all tests**

Run: `pnpm test`

Expected: all test files pass.

- [ ] **Step 6: Run checks**

Run: `pnpm check`

Expected: Biome exits 0. If Biome still reports nested `.worktrees`, verify `biome.json` includes `"!.worktrees"`.

- [ ] **Step 7: Run build**

Run: `pnpm build`

Expected: TypeScript exits 0.

- [ ] **Step 8: Run bounded CLI smoke**

Run: `pnpm build && timeout 1s node dist/cli.js`

Expected: process exits by timeout and prints no stdout logs outside MCP protocol output. Stderr may contain startup failure only if the MCP server itself cannot start, which should not happen for missing roots.

- [ ] **Step 9: Inspect changes**

Run: `git status --short`

Run: `git diff`

Run: `git log --oneline -10`

Expected: only Slice 4 files are changed. Do not revert unrelated user changes.

- [ ] **Step 10: Optional commit only when explicitly requested**

If user asks for a commit, run:

```sh
git add -- package.json pnpm-lock.yaml biome.json README.md docs/superpowers/README.md src/providers/semantic-provider.ts src/providers/static-semantic-provider.ts src/providers/lsp-semantic-provider.ts src/languages/typescript/preset.ts src/languages/typescript/project-routing.ts src/lsp/types.ts src/lsp/session.ts src/lsp/session-manager.ts src/tools/health.ts src/tools/capabilities.ts src/server.ts tests/tools/health.test.ts tests/tools/capabilities.test.ts tests/server.test.ts tests/languages/typescript/preset.test.ts tests/languages/typescript/project-routing.test.ts tests/lsp/session.test.ts tests/lsp/session-manager.test.ts tests/providers/lsp-semantic-provider.test.ts
git commit -m "feat: add lsp initialization foundation"
```

Expected: commit includes only intended Slice 4 implementation files.

## Acceptance Checklist

- [ ] Provider contract accepts passive and active health/capabilities requests.
- [ ] Existing static provider behavior remains stable for injected/default scaffold tests.
- [ ] MCP tool input schemas accept optional `check` and `file`.
- [ ] TypeScript preset maps supported extensions to language IDs.
- [ ] Project routing uses nearest `tsconfig.json`, else nearest `package.json`, else root.
- [ ] Project routing uses `resolveSafePath` and rejects unsupported extensions.
- [ ] LSP session starts configured command and initializes over JSON-RPC.
- [ ] LSP session captures compact server capability names.
- [ ] Missing or failed LSP startup returns failed health, not thrown MCP crashes.
- [ ] Session manager caches sessions by project anchor.
- [ ] CLI startup loads config and root resolution, but exposes setup errors through health when possible.
- [ ] No semantic tools, document sync, diagnostics, hover, or definition behavior is added.
- [ ] stdout remains reserved for MCP protocol.
- [ ] `pnpm test`, `pnpm check`, `pnpm build`, and bounded CLI smoke are verified with fresh output.

## Plan Self-Review

- Spec coverage: dependencies, TypeScript preset, project routing, LSP session, initialize, capability capture, provider mapping, tool input handling, docs, and verification are covered.
- Placeholder scan: no placeholders remain.
- Type consistency: `HealthRequest`, `CapabilitiesRequest`, `LspSessionInfo`, `LspSemanticProvider`, `LspSessionManager`, and route result names are consistent across tasks.
- Scope check: no semantic tools or document sync are implemented in this plan.
