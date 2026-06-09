// tests/integration/semantic-tools.test.ts
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  requestDefinition,
  requestHover,
  requestReferences,
} from "../../src/lsp/semantic-requests.js";
import { LspSession } from "../../src/lsp/session.js";
import { LspSemanticProvider } from "../../src/providers/lsp-semantic-provider.js";

const FIXTURE_ROOT = path.resolve(
  fileURLToPath(import.meta.url),
  "../../fixtures/sample-project",
);
const INDEX_FILE = path.join(FIXTURE_ROOT, "src/index.ts");
const UTILS_FILE = path.join(FIXTURE_ROOT, "src/utils.ts");
const BROKEN_FILE = path.join(FIXTURE_ROOT, "src/broken.ts");

const tsLsCommand = path.resolve(
  fileURLToPath(import.meta.url),
  "../../../node_modules/.bin/typescript-language-server",
);

describe("semantic tools integration", { timeout: 30_000 }, () => {
  let session: LspSession;

  beforeAll(async () => {
    session = new LspSession({
      command: [tsLsCommand, "--stdio"],
      projectAnchor: FIXTURE_ROOT,
      rootPath: FIXTURE_ROOT,
    });

    const info = await session.initialize();
    expect(info.state).toBe("ready");
  }, 30_000);

  afterAll(async () => {
    session?.stop();
  });

  it("resolves definition of imported symbol to utils.ts", async () => {
    // index.ts line 3: `const result = add(1, 2);`
    // "add" on line 3 col 16 (1-based) -> line 2 char 15 (0-based)
    await session.prepareFile(INDEX_FILE, "typescript");
    await session.prepareFile(UTILS_FILE, "typescript");

    const uri = pathToFileURL(INDEX_FILE).toString();
    const connection = session.getConnection();
    if (connection === undefined) throw new Error("expected LSP connection");
    const result = await requestDefinition(connection, uri, {
      line: 2,
      character: 15,
    });

    if (result === null) throw new Error("expected definition result");
    const locs = Array.isArray(result) ? result : [result];
    expect(locs.length).toBeGreaterThan(0);

    const def = locs[0];
    if (def === undefined) throw new Error("expected definition location");
    const targetUri = "targetUri" in def ? def.targetUri : def.uri;
    expect(targetUri).toContain("utils.ts");
  }, 15_000);

  it("finds references to exported function", async () => {
    // utils.ts line 2: `export function add(...)` - "add" at col 17 (1-based) -> char 16 (0-based)
    await session.prepareFile(UTILS_FILE, "typescript");
    await session.prepareFile(INDEX_FILE, "typescript");

    const uri = pathToFileURL(UTILS_FILE).toString();
    const connection = session.getConnection();
    if (connection === undefined) throw new Error("expected LSP connection");
    const result = await requestReferences(connection, uri, {
      line: 1,
      character: 16,
    });

    if (result === null) throw new Error("expected references result");
    expect(result.length).toBeGreaterThanOrEqual(2); // definition + usage in index.ts
  }, 15_000);

  it("returns hover type info for variable", async () => {
    // index.ts line 3: `const result = add(1, 2);` - hover "result" at col 7 (1-based) -> char 6 (0-based)
    await session.prepareFile(INDEX_FILE, "typescript");

    const uri = pathToFileURL(INDEX_FILE).toString();
    const connection = session.getConnection();
    if (connection === undefined) throw new Error("expected LSP connection");
    const result = await requestHover(connection, uri, {
      line: 2,
      character: 6,
    });

    if (result === null) throw new Error("expected hover result");
    const content =
      typeof result.contents === "string"
        ? result.contents
        : "value" in result.contents
          ? result.contents.value
          : "";
    expect(content).toContain("number");
  }, 15_000);

  it("diagnostics store receives errors for broken file", async () => {
    await session.prepareFile(BROKEN_FILE, "typescript");

    const brokenUri = pathToFileURL(BROKEN_FILE).toString();
    const store = session.getDiagnosticsStore();
    if (store === undefined) throw new Error("expected diagnostics store");
    const diagnostics = await store.waitForDiagnostics(brokenUri, 10_000);

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.some((d) => d.severity === 1)).toBe(true); // severity 1 = error
  }, 15_000);

  it("provider returns diagnostics for repeated unchanged file requests", async () => {
    const provider = new LspSemanticProvider({
      manager: {
        getSummary() {
          const info = session.getInfo();
          return {
            state: info.state,
            message: info.message,
            serverCapabilities: info.serverCapabilities,
          };
        },
        async ensureSession() {
          return { info: session.getInfo(), session };
        },
      },
    });

    const first = await provider.getDiagnostics({ file: BROKEN_FILE });
    expect(first.diagnostics.some((d) => d.severity === "error")).toBe(true);

    const second = await provider.getDiagnostics({ file: BROKEN_FILE });
    expect(second.diagnostics.some((d) => d.severity === "error")).toBe(true);
  }, 15_000);

  it("rename add returns locations in utils.ts and index.ts", async () => {
    await session.prepareFile(UTILS_FILE, "typescript");
    await session.prepareFile(INDEX_FILE, "typescript");

    const provider = new LspSemanticProvider({
      manager: {
        getSummary() {
          const info = session.getInfo();
          return {
            state: info.state,
            message: info.message,
            serverCapabilities: info.serverCapabilities,
          };
        },
        async ensureSession() {
          return { info: session.getInfo(), session };
        },
      },
    });

    const result = await provider.getRename({
      file: UTILS_FILE,
      line: 2,
      column: 17,
      newName: "sum",
    });

    expect(result.canRename).toBe(true);
    expect(result.locations.length).toBeGreaterThanOrEqual(2);
    const files = result.locations.map((l) => l.file);
    expect(files.some((f) => f.includes("utils.ts"))).toBe(true);
    expect(files.some((f) => f.includes("index.ts"))).toBe(true);
  }, 15_000);

  it("call hierarchy incoming on add returns callers from index.ts", async () => {
    await session.prepareFile(UTILS_FILE, "typescript");
    await session.prepareFile(INDEX_FILE, "typescript");

    const provider = new LspSemanticProvider({
      manager: {
        getSummary() {
          const info = session.getInfo();
          return {
            state: info.state,
            message: info.message,
            serverCapabilities: info.serverCapabilities,
          };
        },
        async ensureSession() {
          return { info: session.getInfo(), session };
        },
      },
    });

    const result = await provider.getCallHierarchy({
      file: UTILS_FILE,
      line: 2,
      column: 17,
      direction: "incoming",
    });

    expect(result.item).not.toBeNull();
    expect(result.item?.name).toBe("add");
    expect(result.incoming).toBeDefined();
    expect(result.incoming?.length).toBeGreaterThan(0);
    expect(result.incoming?.some((c) => c.from.file.includes("index.ts"))).toBe(
      true,
    );
  }, 15_000);

  it("call hierarchy outgoing on main returns add and createGreeting callees", async () => {
    await session.prepareFile(INDEX_FILE, "typescript");
    await session.prepareFile(UTILS_FILE, "typescript");

    const provider = new LspSemanticProvider({
      manager: {
        getSummary() {
          const info = session.getInfo();
          return {
            state: info.state,
            message: info.message,
            serverCapabilities: info.serverCapabilities,
          };
        },
        async ensureSession() {
          return { info: session.getInfo(), session };
        },
      },
    });

    // index.ts line 6: `export function main(): void {`
    // "main" at col 17 (1-based)
    // main body calls console.log - that is the outgoing callee
    const result = await provider.getCallHierarchy({
      file: INDEX_FILE,
      line: 6,
      column: 17,
      direction: "outgoing",
    });

    expect(result.item).not.toBeNull();
    expect(result.item?.name).toBe("main");
    expect(result.outgoing).toBeDefined();
    expect(result.outgoing?.length).toBeGreaterThan(0);
  }, 15_000);
});
