# Slice 2 Provider Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a provider-backed foundation for current MCP tools, plus config defaults and workspace root data helpers, without adding real LSP behavior.

**Architecture:** The MCP server registers the same public `health` and `capabilities` tools, but handlers call a `SemanticProvider` instead of returning hardcoded final strings. A `StaticSemanticProvider` preserves Slice 1 behavior while config and workspace modules define pure future-facing data boundaries.

**Tech Stack:** Node 20, TypeScript ESM, pnpm, official MCP TypeScript SDK, Zod v4, Vitest, Biome.

---

## File Structure

- Create `src/providers/semantic-provider.ts`: provider interface, health status type, health result type, capabilities result type.
- Create `src/providers/static-semantic-provider.ts`: static implementation preserving Slice 1 semantics.
- Create `src/config/config.ts`: config types and default config constant only, no file IO.
- Create `src/workspace/roots.ts`: workspace root type and pure normalization helper.
- Modify `src/tools/health.ts`: format provider health data and expose provider-backed tool factory.
- Modify `src/tools/capabilities.ts`: format provider capabilities data and expose provider-backed tool factory.
- Modify `src/server.ts`: accept optional `SemanticProvider`, default to `StaticSemanticProvider`, and register provider-backed handlers.
- Modify `tests/server.test.ts`: verify injected provider is used over MCP.
- Modify `tests/tools/health.test.ts`: verify provider-backed formatting and text result.
- Modify `tests/tools/capabilities.test.ts`: verify provider-backed formatting and text result.
- Create `tests/providers/static-semantic-provider.test.ts`: verify static provider contract.
- Create `tests/config/config.test.ts`: verify default config values.
- Create `tests/workspace/roots.test.ts`: verify empty and normalized root records.
- Modify `README.md`: update status after implementation.

## Task 1: Provider Contract And Static Provider

**Files:**
- Create: `src/providers/semantic-provider.ts`
- Create: `src/providers/static-semantic-provider.ts`
- Test: `tests/providers/static-semantic-provider.test.ts`

- [ ] **Step 1: Write failing static provider tests**

```ts
import { describe, expect, it } from "vitest";

import { StaticSemanticProvider } from "../../src/providers/static-semantic-provider.js";

describe("StaticSemanticProvider", () => {
  it("reports scaffold health", async () => {
    const provider = new StaticSemanticProvider();

    await expect(provider.getHealth()).resolves.toEqual({
      status: "not_started",
      message: "LSP sessions are not implemented in this scaffold.",
    });
  });

  it("reports scaffold capabilities", async () => {
    const provider = new StaticSemanticProvider();

    await expect(provider.getCapabilities()).resolves.toEqual({
      status: "ready",
      supportedTools: ["health", "capabilities"],
      lsp: "not_implemented",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test tests/providers/static-semantic-provider.test.ts`

Expected: FAIL because provider files do not exist.

- [ ] **Step 3: Add provider interface**

Create `src/providers/semantic-provider.ts`:

```ts
export type HealthStatus =
  | "not_started"
  | "starting"
  | "ready"
  | "degraded"
  | "failed";

export interface HealthInfo {
  status: HealthStatus;
  message: string;
}

export interface CapabilitiesInfo {
  status: HealthStatus;
  supportedTools: string[];
  lsp: "not_implemented" | "implemented";
}

export interface SemanticProvider {
  getHealth(): Promise<HealthInfo>;
  getCapabilities(): Promise<CapabilitiesInfo>;
}
```

- [ ] **Step 4: Add static provider implementation**

Create `src/providers/static-semantic-provider.ts`:

```ts
import type {
  CapabilitiesInfo,
  HealthInfo,
  SemanticProvider,
} from "./semantic-provider.js";

export class StaticSemanticProvider implements SemanticProvider {
  async getHealth(): Promise<HealthInfo> {
    return {
      status: "not_started",
      message: "LSP sessions are not implemented in this scaffold.",
    };
  }

  async getCapabilities(): Promise<CapabilitiesInfo> {
    return {
      status: "ready",
      supportedTools: ["health", "capabilities"],
      lsp: "not_implemented",
    };
  }
}
```

- [ ] **Step 5: Run test to verify pass**

Run: `pnpm test tests/providers/static-semantic-provider.test.ts`

Expected: PASS.

- [ ] **Step 6: Checkpoint provider contract**

If commits are approved for plan execution, run:

```bash
git add src/providers tests/providers
git commit -m "feat: add semantic provider foundation"
```

If commits are not approved, leave changes unstaged and continue.

## Task 2: Provider-Backed Tool Formatting

**Files:**
- Modify: `src/tools/health.ts`
- Modify: `src/tools/capabilities.ts`
- Test: `tests/tools/health.test.ts`
- Test: `tests/tools/capabilities.test.ts`

- [ ] **Step 1: Update health tests first**

Ensure `tests/tools/health.test.ts` verifies formatting from provider data:

```ts
import { describe, expect, it } from "vitest";

import {
  createHealthTool,
  formatHealthText,
} from "../../src/tools/health.js";

describe("health tool", () => {
  it("formats provider health info as stable plain text", () => {
    expect(
      formatHealthText({
        status: "not_started",
        message: "LSP sessions are not implemented in this scaffold.",
      }),
    ).toBe(
      [
        "Status: not_started",
        "Tool: health",
        "Message: LSP sessions are not implemented in this scaffold.",
      ].join("\n"),
    );
  });

  it("returns MCP text content from provider health", async () => {
    const handler = createHealthTool({
      async getHealth() {
        return {
          status: "not_started" as const,
          message: "LSP sessions are not implemented in this scaffold.",
        };
      },
      async getCapabilities() {
        throw new Error("not used");
      },
    });

    await expect(handler()).resolves.toEqual({
      content: [
        {
          type: "text",
          text: [
            "Status: not_started",
            "Tool: health",
            "Message: LSP sessions are not implemented in this scaffold.",
          ].join("\n"),
        },
      ],
    });
  });
});
```

- [ ] **Step 2: Update capabilities tests first**

Ensure `tests/tools/capabilities.test.ts` verifies formatting from provider data:

```ts
import { describe, expect, it } from "vitest";

import {
  createCapabilitiesTool,
  formatCapabilitiesText,
} from "../../src/tools/capabilities.js";

describe("capabilities tool", () => {
  it("formats provider capabilities as stable plain text", () => {
    expect(
      formatCapabilitiesText({
        status: "ready",
        supportedTools: ["health", "capabilities"],
        lsp: "not_implemented",
      }),
    ).toBe(
      [
        "Status: ready",
        "Tool: capabilities",
        "Supported tools: health, capabilities",
        "LSP: not implemented",
      ].join("\n"),
    );
  });

  it("returns MCP text content from provider capabilities", async () => {
    const handler = createCapabilitiesTool({
      async getHealth() {
        throw new Error("not used");
      },
      async getCapabilities() {
        return {
          status: "ready" as const,
          supportedTools: ["health", "capabilities"],
          lsp: "not_implemented" as const,
        };
      },
    });

    await expect(handler()).resolves.toEqual({
      content: [
        {
          type: "text",
          text: [
            "Status: ready",
            "Tool: capabilities",
            "Supported tools: health, capabilities",
            "LSP: not implemented",
          ].join("\n"),
        },
      ],
    });
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run: `pnpm test tests/tools/health.test.ts tests/tools/capabilities.test.ts`

Expected: FAIL because new tool factories and formatters do not exist yet.

- [ ] **Step 4: Update health tool implementation**

Modify `src/tools/health.ts`:

```ts
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { HealthInfo, SemanticProvider } from "../providers/semantic-provider.js";
import { StaticSemanticProvider } from "../providers/static-semantic-provider.js";
import { textResult } from "./text-result.js";

export function formatHealthText(health: HealthInfo): string {
  return [
    `Status: ${health.status}`,
    "Tool: health",
    `Message: ${health.message}`,
  ].join("\n");
}

export function createHealthTool(provider: SemanticProvider) {
  return async function getHealthResult(): Promise<CallToolResult> {
    return textResult(formatHealthText(await provider.getHealth()));
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

- [ ] **Step 5: Update capabilities tool implementation**

Modify `src/tools/capabilities.ts`:

```ts
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type {
  CapabilitiesInfo,
  SemanticProvider,
} from "../providers/semantic-provider.js";
import { StaticSemanticProvider } from "../providers/static-semantic-provider.js";
import { textResult } from "./text-result.js";

function formatLspState(lsp: CapabilitiesInfo["lsp"]): string {
  return lsp.replace("_", " ");
}

export function formatCapabilitiesText(capabilities: CapabilitiesInfo): string {
  return [
    `Status: ${capabilities.status}`,
    "Tool: capabilities",
    `Supported tools: ${capabilities.supportedTools.join(", ")}`,
    `LSP: ${formatLspState(capabilities.lsp)}`,
  ].join("\n");
}

export function createCapabilitiesTool(provider: SemanticProvider) {
  return async function getCapabilitiesResult(): Promise<CallToolResult> {
    return textResult(formatCapabilitiesText(await provider.getCapabilities()));
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

- [ ] **Step 6: Run tool tests to verify pass**

Run: `pnpm test tests/tools/health.test.ts tests/tools/capabilities.test.ts`

Expected: PASS.

- [ ] **Step 7: Checkpoint provider-backed tools**

If commits are approved for plan execution, run:

```bash
git add src/tools tests/tools
git commit -m "refactor: route scaffold tools through provider"
```

If commits are not approved, leave changes unstaged and continue.

## Task 3: Server Dependency Injection

**Files:**
- Modify: `src/server.ts`
- Modify: `tests/server.test.ts`

- [ ] **Step 1: Update MCP server test first**

Add an injected provider case to `tests/server.test.ts`:

```ts
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

  const result = await client.callTool({ name: "health", arguments: {} });
  expect(result.content).toEqual([
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
```

- [ ] **Step 2: Run server test to verify failure**

Run: `pnpm test tests/server.test.ts`

Expected: FAIL because `createServer` does not accept options yet.

- [ ] **Step 3: Update server construction**

Modify `src/server.ts`:

```ts
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
```

- [ ] **Step 4: Run server test to verify pass**

Run: `pnpm test tests/server.test.ts`

Expected: PASS.

- [ ] **Step 5: Checkpoint server injection**

If commits are approved for plan execution, run:

```bash
git add src/server.ts tests/server.test.ts
git commit -m "refactor: inject semantic provider into server"
```

If commits are not approved, leave changes unstaged and continue.

## Task 4: Config Defaults

**Files:**
- Create: `src/config/config.ts`
- Test: `tests/config/config.test.ts`

- [ ] **Step 1: Write failing config defaults test**

```ts
import { describe, expect, it } from "vitest";

import { defaultConfig } from "../../src/config/config.js";

describe("defaultConfig", () => {
  it("uses approved foundation defaults", () => {
    expect(defaultConfig).toEqual({
      roots: [],
      languages: {
        typescript: {
          enabled: true,
          command: ["typescript-language-server", "--stdio"],
          extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"],
          projectMarkers: ["tsconfig.json", "package.json"],
        },
      },
      sessions: {
        idleTimeoutMs: 900000,
        restartOnCrash: true,
      },
      output: {
        defaultLimit: 50,
      },
    });
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test tests/config/config.test.ts`

Expected: FAIL because config module does not exist.

- [ ] **Step 3: Add config module**

Create `src/config/config.ts`:

```ts
export interface TypeScriptLanguageConfig {
  enabled: boolean;
  command: string[];
  extensions: string[];
  projectMarkers: string[];
}

export interface LspMcpConfig {
  roots: string[];
  languages: {
    typescript: TypeScriptLanguageConfig;
  };
  sessions: {
    idleTimeoutMs: number;
    restartOnCrash: boolean;
  };
  output: {
    defaultLimit: number;
  };
}

export const defaultConfig: LspMcpConfig = {
  roots: [],
  languages: {
    typescript: {
      enabled: true,
      command: ["typescript-language-server", "--stdio"],
      extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"],
      projectMarkers: ["tsconfig.json", "package.json"],
    },
  },
  sessions: {
    idleTimeoutMs: 900000,
    restartOnCrash: true,
  },
  output: {
    defaultLimit: 50,
  },
};
```

- [ ] **Step 4: Run config test to verify pass**

Run: `pnpm test tests/config/config.test.ts`

Expected: PASS.

- [ ] **Step 5: Checkpoint config defaults**

If commits are approved for plan execution, run:

```bash
git add src/config tests/config
git commit -m "feat: add config defaults"
```

If commits are not approved, leave changes unstaged and continue.

## Task 5: Workspace Root Model

**Files:**
- Create: `src/workspace/roots.ts`
- Test: `tests/workspace/roots.test.ts`

- [ ] **Step 1: Write failing workspace root tests**

```ts
import { describe, expect, it } from "vitest";

import { normalizeWorkspaceRoots } from "../../src/workspace/roots.js";

describe("normalizeWorkspaceRoots", () => {
  it("represents empty roots explicitly", () => {
    expect(normalizeWorkspaceRoots([])).toEqual([]);
  });

  it("normalizes string roots into root records", () => {
    expect(normalizeWorkspaceRoots(["/workspace/project"])).toEqual([
      { path: "/workspace/project" },
    ]);
  });

  it("preserves named root records", () => {
    expect(
      normalizeWorkspaceRoots([
        { name: "project", path: "/workspace/project" },
      ]),
    ).toEqual([{ name: "project", path: "/workspace/project" }]);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test tests/workspace/roots.test.ts`

Expected: FAIL because workspace module does not exist.

- [ ] **Step 3: Add workspace root helper**

Create `src/workspace/roots.ts`:

```ts
export interface WorkspaceRoot {
  name?: string;
  path: string;
}

export type WorkspaceRootInput = string | WorkspaceRoot;

export function normalizeWorkspaceRoots(
  roots: WorkspaceRootInput[],
): WorkspaceRoot[] {
  return roots.map((root) => {
    if (typeof root === "string") {
      return { path: root };
    }

    return root;
  });
}
```

- [ ] **Step 4: Run workspace test to verify pass**

Run: `pnpm test tests/workspace/roots.test.ts`

Expected: PASS.

- [ ] **Step 5: Checkpoint workspace root model**

If commits are approved for plan execution, run:

```bash
git add src/workspace tests/workspace
git commit -m "feat: add workspace root model"
```

If commits are not approved, leave changes unstaged and continue.

## Task 6: README And Full Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README status**

Change `README.md` status to say Slice 2 adds provider-backed scaffold behavior, config defaults, and workspace root model while real LSP behavior remains future work.

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`

Expected: PASS, including existing Slice 1 tests and new Slice 2 tests.

- [ ] **Step 3: Run code check**

Run: `pnpm check`

Expected: PASS with no fixes applied.

- [ ] **Step 4: Run build**

Run: `pnpm build`

Expected: PASS.

- [ ] **Step 5: Run bounded CLI smoke**

Run: `timeout 1s node dist/cli.js`

Expected: command exits by timeout with no stdout logs.

- [ ] **Step 6: Inspect status and diff**

Run: `git status --short` and `git diff --stat`

Expected: only intended Slice 2 implementation and README changes remain uncommitted. If optional checkpoint commits were used, this may show only README changes or a clean worktree after the final commit.

- [ ] **Step 7: Checkpoint README update**

If commits are approved for plan execution, run:

```bash
git add README.md
git commit -m "docs: update status for provider foundation"
```

If commits are not approved, leave changes unstaged for final review.

## Final Acceptance

- [ ] `pnpm test` passes.
- [ ] `pnpm check` passes.
- [ ] `pnpm build` passes.
- [ ] Bounded CLI smoke produces no stdout logs.
- [ ] `health` and `capabilities` public text output stays compatible with Slice 1.
- [ ] Server supports injected providers in tests.
- [ ] Config module has defaults only and no file IO.
- [ ] Workspace root module has pure data helpers only and no cwd fallback.
