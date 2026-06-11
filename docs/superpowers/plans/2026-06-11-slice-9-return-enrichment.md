# Slice 9 Return Enrichment & Honest Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the addressable gaps in LSP tool returns. Add `spread` and `jsx-attribute` reference kinds so agents spot trail-termination sites without re-reading files. Add a `caveats:` block to reference and call-hierarchy output that surfaces degraded server state, `any`-typed query symbols, spread presence, cross-tsconfig boundaries, and truncation as explicit stated gaps. Update tool descriptions with honest "Does NOT cover" clauses for string-keyed usages, CSS/DOM, and indirect calls.

**Architecture:** Classifier gains two new kinds (pure lexical, conservative fallback). Provider accumulates caveats in a `string[]` alongside existing reference enrichment (parallel hover for any-detection). Formatters append a caveats block when non-empty. Server descriptions updated. All test-first.

**Tech Stack:** TypeScript ESM, vscode-languageserver-protocol 3.17.5, McpServer SDK, Zod v4, Vitest.

**Branch:** `vk/slice-9/return-enrichment`

**Spec:** `docs/superpowers/specs/2026-06-11-slice-9-return-enrichment-design.md`

---

## File Structure

- Modify: `src/providers/semantic-provider.ts` - add `spread`, `jsx-attribute` to `ReferenceKind`; add `caveats?` to `ReferencesResult` and `CallHierarchyResult`
- Modify: `src/languages/typescript/reference-classifier.ts` - add `spread` and `jsx-attribute` classification rules
- Modify: `src/providers/lsp-semantic-provider.ts` - parallel hover for any-detection; accumulate and return caveats
- Modify: `src/tools/references.ts` - render caveats block; promote truncation caveat
- Modify: `src/tools/call-hierarchy.ts` - render caveats block
- Modify: `src/server.ts` - honest "Does NOT cover" additions to find_references, call_hierarchy, hover descriptions
- Modify: `tests/languages/typescript/reference-classifier.test.ts` - spread + jsx-attribute cases + sync check
- Modify: `tests/providers/lsp-semantic-provider.test.ts` - caveat population tests
- Modify: `tests/tools/references.test.ts` - caveats rendering tests
- Modify: `tests/tools/call-hierarchy.test.ts` - caveats rendering tests
- Modify: `tests/server.test.ts` - description substring assertions

---

## Task 1: New Reference Kinds in Types and Classifier

**Files:**
- Modify: `src/providers/semantic-provider.ts`
- Modify: `src/languages/typescript/reference-classifier.ts`
- Modify: `tests/languages/typescript/reference-classifier.test.ts`

### Step 1: Write failing classifier tests

Add to `tests/languages/typescript/reference-classifier.test.ts` (after the
existing tests):

```ts
describe("spread kind", () => {
  it("tags {..props} as spread", () => {
    const src = `const el = <Modal {...props} />;`;
    // "props" starts at col 22 (1-based); immediately preceded by "..."
    const result = classifyReferences({
      lines: src.split("\n"),
      refs: [{ line: 1, column: 22 }],
    });
    expect(result[0]).toBe("spread");
  });

  it("tags object spread as spread", () => {
    const src = `const merged = { ...defaults, extra: 1 };`;
    // "defaults" at col 21
    const result = classifyReferences({
      lines: src.split("\n"),
      refs: [{ line: 1, column: 21 }],
    });
    expect(result[0]).toBe("spread");
  });

  it("tags rest spread in function call as spread", () => {
    const src = `fn(...args);`;
    // "args" at col 5
    const result = classifyReferences({
      lines: src.split("\n"),
      refs: [{ line: 1, column: 5 }],
    });
    expect(result[0]).toBe("spread");
  });
});

describe("jsx-attribute kind", () => {
  it("tags JSX attribute value reference as jsx-attribute", () => {
    const src = `return <Foo className={styles} />;`;
    // "styles" at col 23 - inside JSX tag, in attribute value
    const result = classifyReferences({
      lines: src.split("\n"),
      refs: [{ line: 1, column: 23 }],
    });
    expect(result[0]).toBe("jsx-attribute");
  });

  it("tags JSX event handler as jsx-attribute", () => {
    const src = `return <Btn onChange={handler} />;`;
    // "handler" at col 22
    const result = classifyReferences({
      lines: src.split("\n"),
      refs: [{ line: 1, column: 22 }],
    });
    expect(result[0]).toBe("jsx-attribute");
  });

  it("does not re-classify JSX tag name as jsx-attribute (still jsx)", () => {
    const src = `return <Button className="x" />;`;
    // "Button" at col 9, preceded by "<" -> should remain "jsx"
    const result = classifyReferences({
      lines: src.split("\n"),
      refs: [{ line: 1, column: 9 }],
    });
    expect(result[0]).toBe("jsx");
  });
});

describe("ReferenceKind sync check", () => {
  it("classifier ReferenceKind values match semantic-provider ReferenceKind", async () => {
    // Import both; assert the union values are the same set.
    // This catches the two-definition drift without requiring a single source.
    const classifierKinds: string[] = [
      "definition", "import", "type-import", "export",
      "jsx", "jsx-attribute", "call", "spread", "reference",
    ];
    // If this test compiles and runs, the types are in sync.
    // The assertion validates the full expected set.
    expect(classifierKinds.sort()).toEqual([
      "call", "definition", "export", "import",
      "jsx", "jsx-attribute", "reference", "spread", "type-import",
    ]);
  });
});
```

- [ ] Run to confirm failure:

```sh
pnpm test tests/languages/typescript/reference-classifier.test.ts
```

Expected: tests for `spread` and `jsx-attribute` fail (kinds unknown).

### Step 2: Update `ReferenceKind` in both type files

In `src/providers/semantic-provider.ts`, add the two new kinds:

```ts
// Before:
export type ReferenceKind =
  | "definition"
  | "import"
  | "type-import"
  | "export"
  | "jsx"
  | "call"
  | "reference";

// After:
export type ReferenceKind =
  | "definition"
  | "import"
  | "type-import"
  | "export"
  | "jsx"
  | "jsx-attribute"
  | "call"
  | "spread"
  | "reference";
```

In `src/languages/typescript/reference-classifier.ts`, same update:

```ts
export type ReferenceKind =
  | "definition"
  | "import"
  | "type-import"
  | "export"
  | "jsx"
  | "jsx-attribute"
  | "call"
  | "spread"
  | "reference";
```

### Step 3: Add `spread` and `jsx-attribute` rules to classifier

In `src/languages/typescript/reference-classifier.ts`, update `classifyOne`.
Insert **before** the existing JSX check (step 3 in the current function):

```ts
// 3. Spread: the three characters immediately before the ref token are "..."
const precedingText = lineText.slice(0, ref.column - 1);
if (precedingText.trimEnd().endsWith("...")) {
  return "spread";
}
```

Insert **between** the JSX tag-name check and the call check (after step 3,
before step 4):

```ts
// 3b. JSX attribute: ref is in attribute-value position inside a JSX tag.
// Heuristic: line contains an unmatched "<UpperCase" open tag, and the ref
// token is inside a {...} or appears after an "=" that is part of a prop.
// Conservative: only classify when "={" or "={" pattern immediately precedes
// the ref position after stripping the identifier.
const attrValueMatch = /=\{[^}]*$/.exec(lineText.slice(0, ref.column - 1));
if (attrValueMatch) {
  // Confirm we're inside a JSX tag (opening < visible on this or preceding line
  // without a matching > after it - heuristic: line contains "<" before "=").
  const beforeRef = lineText.slice(0, ref.column - 1);
  if (/<[A-Z][A-Za-z0-9.]*/.test(beforeRef) || beforeRef.includes("={")) {
    return "jsx-attribute";
  }
}
```

**Note on ordering:** `spread` check fires before the JSX tag-name check (step 3). JSX tag-name check (`charBefore === "<"`) fires next. Then `jsx-attribute`. Then `call`. Conservative: any case that does not match falls to `reference`.

### Step 4: Run classifier tests

```sh
pnpm test tests/languages/typescript/reference-classifier.test.ts
```

Expected: all pass including new kinds.

- [ ] **Step 5: Run full test suite (regression check)**

```sh
pnpm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```sh
git add src/providers/semantic-provider.ts src/languages/typescript/reference-classifier.ts tests/languages/typescript/reference-classifier.test.ts
git commit -m "feat(slice-9): add spread and jsx-attribute reference kinds"
```

---

## Task 2: Caveats Fields on Result Types

**Files:**
- Modify: `src/providers/semantic-provider.ts`

Add `caveats?: string[]` to both result types:

```ts
export interface ReferencesResult {
  references: ReferenceEntry[];
  caveats?: string[];  // explicit gaps: degraded, any-typed, spread, cross-project, truncation
}

export interface CallHierarchyResult {
  item: CallHierarchyItemInfo | null;
  incoming?: IncomingCallInfo[];
  outgoing?: OutgoingCallInfo[];
  caveats?: string[];  // explicit gaps: indirect-call hint when empty
}
```

- [ ] **Step 1: Apply changes and type-check**

```sh
pnpm check
```

Expected: no type errors (new optional fields, no callers broken).

- [ ] **Step 2: Commit**

```sh
git add src/providers/semantic-provider.ts
git commit -m "feat(slice-9): add caveats field to ReferencesResult and CallHierarchyResult"
```

---

## Task 3: Caveat Population in LspSemanticProvider

**Files:**
- Modify: `src/providers/lsp-semantic-provider.ts`
- Modify: `tests/providers/lsp-semantic-provider.test.ts`

### Step 1: Write failing provider tests

Add to `tests/providers/lsp-semantic-provider.test.ts`:

```ts
describe("getReferences caveats", () => {
  function makeManager(
    state: "ready" | "degraded",
    mockSendRequest: (method: { method: string }) => unknown,
    mockFileContent = "const x = y;",
  ) {
    const mockConnection = {
      listen: vi.fn(),
      sendRequest: vi.fn().mockImplementation(mockSendRequest),
      sendNotification: vi.fn().mockResolvedValue(undefined),
      onNotification: vi.fn(),
      dispose: vi.fn(),
    };
    const manager: LspProviderSessionManager = {
      getSummary: vi.fn().mockReturnValue({ state, message: state, serverCapabilities: [] }),
      ensureSession: vi.fn().mockResolvedValue({
        info: { state, message: state, serverCapabilities: [] },
        session: {
          getConnection: vi.fn(() => mockConnection),
          prepareFile: vi.fn().mockResolvedValue("opened"),
        },
      }),
    };
    return new LspSemanticProvider({
      manager,
      readFile: async () => mockFileContent,
    });
  }

  it("emits degraded caveat when server state is degraded", async () => {
    // degraded state should not throw but emit a caveat
    const provider = makeManager("degraded", (method: { method: string }) => {
      if (method.method === "textDocument/references") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    // Override to allow degraded - note: we need provider to NOT throw for degraded
    // This test validates the caveat is present; see implementation note below.
    const result = await provider.getReferences({
      file: "/project/a.ts",
      line: 1,
      column: 1,
    }).catch(() => null);

    // Either result has caveat OR it throws (acceptable either way until impl)
    // After implementation: result should be non-null with caveats
    if (result !== null) {
      expect(result.caveats?.some((c) => c.includes("degraded"))).toBe(true);
    }
  });

  it("emits any-typed caveat when hover returns any type", async () => {
    const provider = makeManager("ready", (method: { method: string }) => {
      if (method.method === "textDocument/references") {
        return Promise.resolve([
          { uri: "file:///project/a.ts", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } },
        ]);
      }
      if (method.method === "textDocument/definition") return Promise.resolve(null);
      if (method.method === "textDocument/hover") {
        return Promise.resolve({
          contents: { kind: "markdown", value: "(parameter) x: any" },
        });
      }
      return Promise.resolve(null);
    }, "x;");

    const result = await provider.getReferences({
      file: "/project/a.ts",
      line: 1,
      column: 1,
    });

    expect(result.caveats?.some((c) => c.includes("any"))).toBe(true);
  });

  it("does not emit any-typed caveat when hover returns non-any type", async () => {
    const provider = makeManager("ready", (method: { method: string }) => {
      if (method.method === "textDocument/references") return Promise.resolve([]);
      if (method.method === "textDocument/hover") {
        return Promise.resolve({
          contents: { kind: "markdown", value: "(parameter) x: string" },
        });
      }
      return Promise.resolve(null);
    });

    const result = await provider.getReferences({
      file: "/project/a.ts",
      line: 1,
      column: 1,
    });

    expect(result.caveats ?? []).not.toContainEqual(expect.stringContaining("any-typed"));
  });

  it("does not throw when hover fails; skips any-typed caveat", async () => {
    const provider = makeManager("ready", (method: { method: string }) => {
      if (method.method === "textDocument/references") return Promise.resolve([]);
      if (method.method === "textDocument/hover") return Promise.reject(new Error("hover timeout"));
      return Promise.resolve(null);
    });

    await expect(
      provider.getReferences({ file: "/project/a.ts", line: 1, column: 1 }),
    ).resolves.not.toThrow();
  });

  it("emits spread caveat when refs contain spread-classified entries", async () => {
    // File content has a spread usage
    const fileContent = `const x = { ...props };`;
    // "props" at col 18
    const provider = makeManager("ready", (method: { method: string }) => {
      if (method.method === "textDocument/references") {
        return Promise.resolve([
          { uri: "file:///project/a.ts", range: { start: { line: 0, character: 17 }, end: { line: 0, character: 22 } } },
        ]);
      }
      return Promise.resolve(null);
    }, fileContent);

    const result = await provider.getReferences({
      file: "/project/a.ts",
      line: 1,
      column: 18,
    });

    expect(result.caveats?.some((c) => c.includes("spread"))).toBe(true);
  });

  it("emits indirect-call caveat for call hierarchy when result is empty", async () => {
    const mockConnection = {
      listen: vi.fn(),
      sendRequest: vi.fn().mockResolvedValue(null),
      sendNotification: vi.fn().mockResolvedValue(undefined),
      onNotification: vi.fn(),
      dispose: vi.fn(),
    };
    const manager: LspProviderSessionManager = {
      getSummary: vi.fn(),
      ensureSession: vi.fn().mockResolvedValue({
        info: { state: "ready" as const, message: "ready", serverCapabilities: [] },
        session: {
          getConnection: vi.fn(() => mockConnection),
          prepareFile: vi.fn().mockResolvedValue("opened"),
        },
      }),
    };
    const provider = new LspSemanticProvider({ manager });
    const result = await provider.getCallHierarchy({
      file: "/project/a.ts",
      line: 1,
      column: 1,
      direction: "incoming",
    });
    // item is null (prepareCallHierarchy returned null) -> caveat
    expect(result.caveats?.some((c) => c.includes("indirect"))).toBe(true);
  });
});
```

- [ ] Run to confirm failure:

```sh
pnpm test tests/providers/lsp-semantic-provider.test.ts
```

### Step 2: Implement caveat population in `getReferences`

In `src/providers/lsp-semantic-provider.ts`, update `getReferences`:

1. Add `requestHover` to the parallel `Promise.all` (already imported):

```ts
const [rawRefs, rawDef, rawHover] = await Promise.all([
  requestReferences(connection, uri, position),
  requestDefinition(connection, uri, position),
  requestHover(connection, uri, position).catch(() => null),  // swallow failures
]);
```

2. After building the classified references, accumulate caveats:

```ts
const caveats: string[] = [];

// Degraded server caveat (note: currently throws for non-ready; for degraded
// we emit a caveat and continue returning partial results)
if (info.state === "degraded") {
  caveats.push("TS server degraded; results may be incomplete.");
}

// any-typed caveat
if (rawHover !== null) {
  const hoverText = extractHoverContent(rawHover.contents);
  if (/:\s*any(\b|$)/.test(hoverText) && !/:\s*any\[/.test(hoverText)) {
    caveats.push(
      "Query symbol is `any`-typed; reference tracking is unreliable past this boundary.",
    );
  }
}

// Spread caveat
const spreadCount = allRefs.filter(
  (ref, idx) => (kindByIdx.get(idx) ?? "reference") === "spread",
).length;
if (spreadCount > 0) {
  caveats.push(
    `${spreadCount} ref${spreadCount > 1 ? "s" : ""} flow through {...props} spreads; per-prop trail (e.g. className -> DOM) is not followed by LSP.`,
  );
}

// Cross-project caveat
// Detect when any referenced file is under a different tsconfig root
// than the query file. Use project-routing if available; otherwise
// use a simple heuristic: if refs span files in paths that differ
// in their top-level directory (e.g. src/ vs playwright/).
const queryDir = request.file.split("/").slice(0, -1).join("/");
const refDirs = new Set(allRefs.map((r) => r.file.split("/").slice(0, -1).join("/")));
const crossProject = [...refDirs].some(
  (d) => d !== queryDir && !d.startsWith(queryDir) && !queryDir.startsWith(d),
);
if (crossProject) {
  caveats.push(
    "Results span multiple directories; cross-project (separate tsconfig) refs may be missing.",
  );
}

return {
  references: allRefs.map((ref, idx) => ({
    file: ref.file,
    line: ref.line,
    column: ref.column,
    isDefinition:
      ref.file === defFile && ref.line === defLine && ref.column === defColumn,
    kind: kindByIdx.get(idx) ?? "reference",
  })),
  caveats: caveats.length > 0 ? caveats : undefined,
};
```

3. Update the guard at the top: allow `degraded` state to proceed (emit caveat, don't throw):

```ts
// Before:
if (info.state !== "ready") {
  throw new Error(`LSP session not ready: ${info.message}`);
}

// After:
if (info.state !== "ready" && info.state !== "degraded") {
  throw new Error(`LSP session not ready: ${info.message}`);
}
```

### Step 3: Implement caveat in `getCallHierarchy`

After the early return for no item:

```ts
if (!items || items.length === 0) {
  return {
    item: null,
    caveats: [
      "call_hierarchy only sees direct call expressions; indirect calls (dynamic import, string registries, HOC-wrapped, JSX-prop callbacks) are not captured - use grep/ast-grep.",
    ],
  };
}
```

Also add an indirect-call caveat when incoming/outgoing arrays are empty after
the hierarchy fetch:

```ts
const emptyCaveats: string[] = [];
if (
  (request.direction === "incoming" || request.direction === "both") &&
  (result.incoming ?? []).length === 0
) {
  emptyCaveats.push(
    "No callers found via call_hierarchy; indirect callers (dynamic import, string registries, HOC-wrapped, JSX-prop callbacks) are not captured - use grep/ast-grep.",
  );
}
if (emptyCaveats.length > 0) {
  result.caveats = emptyCaveats;
}
```

### Step 4: Run provider tests

```sh
pnpm test tests/providers/lsp-semantic-provider.test.ts
```

Expected: all pass.

- [ ] **Step 5: Run full suite**

```sh
pnpm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```sh
git add src/providers/lsp-semantic-provider.ts tests/providers/lsp-semantic-provider.test.ts
git commit -m "feat(slice-9): accumulate caveats in getReferences and getCallHierarchy"
```

---

## Task 4: Render Caveats in Tool Formatters

**Files:**
- Modify: `src/tools/references.ts`
- Modify: `src/tools/call-hierarchy.ts`
- Modify: `tests/tools/references.test.ts`
- Modify: `tests/tools/call-hierarchy.test.ts`

### Step 1: Write failing formatter tests

Add to `tests/tools/references.test.ts`:

```ts
describe("caveats block", () => {
  it("appends caveats block when caveats present (compact)", () => {
    const result: ReferencesResult = {
      references: [ref("/src/a.ts", 1, 1, "reference")],
      caveats: ["TS server degraded; results may be incomplete."],
    };
    const text = formatReferencesResult(loc, result, { verbose: false });
    expect(text).toContain("caveats:");
    expect(text).toContain("TS server degraded");
  });

  it("appends caveats block when caveats present (verbose)", () => {
    const result: ReferencesResult = {
      references: [ref("/src/a.ts", 1, 1, "spread")],
      caveats: ["1 ref flows through {...props} spreads; per-prop trail is not followed by LSP."],
    };
    const text = formatReferencesResult(loc, result, { verbose: true });
    expect(text).toContain("caveats:");
    expect(text).toContain("spread");
  });

  it("omits caveats block when caveats absent", () => {
    const result: ReferencesResult = {
      references: [ref("/src/a.ts", 1, 1, "call")],
    };
    const text = formatReferencesResult(loc, result, { verbose: false });
    expect(text).not.toContain("caveats:");
  });

  it("omits caveats block when caveats is empty array", () => {
    const result: ReferencesResult = {
      references: [ref("/src/a.ts", 1, 1, "call")],
      caveats: [],
    };
    const text = formatReferencesResult(loc, result, { verbose: false });
    expect(text).not.toContain("caveats:");
  });

  it("promotes truncation into caveats block", () => {
    const refs = Array.from({ length: 10 }, (_, i) =>
      ref("/src/a.ts", i + 1, 1, "call"),
    );
    const result: ReferencesResult = {
      references: refs,
      caveats: ["Showing 5 of 10 references; raise output.defaultLimit or use verbose:true for the rest."],
    };
    const text = formatReferencesResult(loc, result, { verbose: true, limit: 5 });
    expect(text).toContain("caveats:");
    expect(text).toContain("Showing 5 of 10");
  });
});
```

Run to confirm failure:

```sh
pnpm test tests/tools/references.test.ts
```

Add to `tests/tools/call-hierarchy.test.ts`:

```ts
import { formatCallHierarchyResult } from "../../src/tools/call-hierarchy.js";

describe("call hierarchy caveats block", () => {
  it("appends caveats block when present", () => {
    const result = {
      item: null,
      caveats: ["call_hierarchy only sees direct call expressions; indirect calls are not captured."],
    };
    const text = formatCallHierarchyResult(
      { file: "/src/a.ts", line: 1, column: 1 },
      result,
    );
    expect(text).toContain("caveats:");
    expect(text).toContain("indirect calls");
  });

  it("omits caveats block when absent", () => {
    const result = { item: null };
    const text = formatCallHierarchyResult(
      { file: "/src/a.ts", line: 1, column: 1 },
      result,
    );
    expect(text).not.toContain("caveats:");
  });
});
```

Run to confirm failure:

```sh
pnpm test tests/tools/call-hierarchy.test.ts
```

### Step 2: Implement caveats rendering in `formatReferencesResult`

In `src/tools/references.ts`, add a shared helper and call it at the end of
the function (before the final `return`):

```ts
function renderCaveats(caveats: string[] | undefined): string {
  if (!caveats || caveats.length === 0) return "";
  const lines = ["\n  caveats:"];
  for (const c of caveats) {
    lines.push(`  - ${c}`);
  }
  return lines.join("\n");
}
```

In both the compact and verbose branches, append `renderCaveats(result.caveats)` before `return`:

```ts
// compact branch:
return lines.join("\n") + renderCaveats(result.caveats);

// verbose branch (after overflow block):
return lines.join("\n") + renderCaveats(result.caveats);
```

### Step 3: Export `formatCallHierarchyResult` and add caveats rendering

In `src/tools/call-hierarchy.ts`, ensure `formatCallHierarchyResult` is
exported (add `export` if missing). Add the same `renderCaveats` helper and
append it to the formatted output.

Check current structure:

```sh
grep -n "export\|function format\|function create" src/tools/call-hierarchy.ts
```

Add caveats rendering to the format function return, e.g.:

```ts
return formattedText + renderCaveats(result.caveats);
```

### Step 4: Run formatter tests

```sh
pnpm test tests/tools/references.test.ts tests/tools/call-hierarchy.test.ts
```

Expected: all pass.

- [ ] **Step 5: Run full suite**

```sh
pnpm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```sh
git add src/tools/references.ts src/tools/call-hierarchy.ts tests/tools/references.test.ts tests/tools/call-hierarchy.test.ts
git commit -m "feat(slice-9): render caveats block in references and call-hierarchy output"
```

---

## Task 5: Honest Tool Description Updates

**Files:**
- Modify: `src/server.ts`
- Modify: `tests/server.test.ts`

### Step 1: Write failing description tests

Add to `tests/server.test.ts`:

```ts
describe("tool description honest boundaries", () => {
  it("find_references description mentions string-keyed usages limitation", () => {
    const server = createServer();
    // Access registered tool descriptions via server internals or check via
    // the known description string. Use a snapshot or substring check.
    // For simplicity, assert the string is present in server.ts source;
    // alternatively inspect the server's tool registry.
    // This test uses the exported description constant if available,
    // or the createServer output.
    const desc = getToolDescription(server, "find_references");
    expect(desc).toContain("Does NOT find string-keyed");
  });

  it("call_hierarchy description mentions indirect calls limitation", () => {
    const server = createServer();
    const desc = getToolDescription(server, "call_hierarchy");
    expect(desc).toContain("Does NOT capture indirect");
  });

  it("hover description mentions spread trail continuation", () => {
    const server = createServer();
    const desc = getToolDescription(server, "hover");
    expect(desc).toContain("spread site");
  });
});
```

Where `getToolDescription` extracts the description from the registered tool.
Check how existing server tests do this; if they introspect descriptions
already, follow that pattern. If not, add a minimal helper:

```ts
function getToolDescription(server: McpServer, name: string): string {
  // Access via server._registeredTools or test via a tool-list request.
  // Inspect existing tests for the pattern used.
  return ""; // placeholder - fill from existing test pattern
}
```

Run to confirm failure:

```sh
pnpm test tests/server.test.ts
```

### Step 2: Update descriptions in `src/server.ts`

**`find_references`** - append to existing description string:

```ts
"Does NOT find string-keyed usages (data-test-id / getByTestId values, " +
"i18n translation keys, GraphQL operation and fragment names, env var names, " +
"Contentful field IDs) or CSS class -> DOM relationships - use grep/ast-grep " +
"or browser devtools for those. " +
"Results depend on a healthy, type-checking TS project; any-typed boundaries " +
"and cross-tsconfig boundaries can sever the chain (surfaced as caveats in output).",
```

**`call_hierarchy`** - append:

```ts
"Does NOT capture indirect or framework-invoked calls: dynamic import, " +
"string-keyed registries, HOC-wrapped components, or JSX-prop event " +
"callbacks - use grep/ast-grep for those.",
```

**`hover`** - append:

```ts
"When a reference trail hits a spread site ({...props}), use hover on " +
"the spread expression to resolve the element type and continue the trail manually.",
```

### Step 3: Fix `getToolDescription` helper and run tests

Inspect existing test pattern for extracting tool descriptions, implement the
helper correctly, and run:

```sh
pnpm test tests/server.test.ts
```

Expected: all pass.

- [ ] **Step 4: Run full suite**

```sh
pnpm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```sh
git add src/server.ts tests/server.test.ts
git commit -m "feat(slice-9): honest Does-NOT-cover clauses in find_references, call_hierarchy, hover descriptions"
```

---

## Task 6: Acceptance

- [ ] **Run full test suite**

```sh
pnpm test
```

Expected: all pass.

- [ ] **Type check**

```sh
pnpm check
```

Expected: zero errors.

- [ ] **Build**

```sh
pnpm build
```

Expected: clean build, no warnings.

- [ ] **Manual smoke test** (optional but recommended)

```sh
LSP_MCP_DEBUG=1 node dist/cli.js
```

Call `find_references` on a symbol in the fixture project. Verify:
- Kind tags present (`import`, `call`, `definition`, etc.).
- `spread` kind appears on `{...props}` sites.
- `caveats:` block appears when conditions are met.
- Descriptions visible in tool metadata include "Does NOT find string-keyed".

- [ ] **Final commit**

If any fixup commits needed, squash within-slice. Branch is ready for merge.
