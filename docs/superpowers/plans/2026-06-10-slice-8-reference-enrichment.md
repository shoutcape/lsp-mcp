# Slice 8 Reference Enrichment & Compact Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `find_references` self-sufficient (no follow-up reads to classify references) and compact by default. Add reference `kind` tags via a lexical block-aware classifier, group output into a summary by default, wire up `output.defaultLimit`, and add `LSP_MCP_DEBUG` instrumentation for cost benchmarking.

**Architecture:** New `reference-classifier.ts` pure module handles classification with no I/O. Provider reads each referenced file once per `getReferences` call (cached in a Map), calls the classifier, and matches the definition position. Formatter gains compact default + verbose opt-in. `createServer` gains an `outputLimit` option threaded from config.

**Tech Stack:** TypeScript ESM, vscode-languageserver-protocol 3.17.5, McpServer SDK, Zod v4, Vitest.

**Branch:** `vk/slice-8/reference-enrichment`

---

## File Structure

- Modify: `src/providers/semantic-provider.ts` - add `ReferenceKind`, update `ReferenceEntry`, add `ReferencesRequest`, update `SemanticProvider.getReferences` signature
- Create: `src/languages/typescript/reference-classifier.ts` - pure lexical classifier
- Modify: `src/providers/lsp-semantic-provider.ts` - enrich getReferences with classification + isDefinition
- Modify: `src/providers/static-semantic-provider.ts` - update stub for new signature
- Modify: `src/tools/references.ts` - compact default, verbose opt-in, limit truncation
- Modify: `src/server.ts` - updated find_references description, `ServerOptions`, `withInstrumentation`, wire outputLimit
- Create: `tests/languages/typescript/reference-classifier.test.ts` - pure unit tests for classifier
- Modify: `tests/tools/references.test.ts` - compact + verbose + limit + kind tests
- Modify: `tests/providers/lsp-semantic-provider.test.ts` - getReferences returns kinds + isDefinition
- Modify: `tests/server.test.ts` - instrumentation tests
- Modify: `tests/integration/semantic-tools.test.ts` - kind tags in real LSP output

---

## Task 1: Provider Contract

**Files:**
- Modify: `src/providers/semantic-provider.ts`
- Modify: `src/providers/static-semantic-provider.ts`

- [ ] **Step 1: Update types in semantic-provider.ts**

Replace the existing `ReferenceEntry` and `ReferencesResult` interfaces and
add `ReferenceKind` and `ReferencesRequest`. Find:

```ts
export interface ReferenceEntry {
  file: string;
  line: number;
  column: number;
  isDefinition: boolean;
  isWriteAccess: boolean;
}

export interface ReferencesResult {
  references: ReferenceEntry[];
}
```

Replace with:

```ts
export type ReferenceKind =
  | "definition"
  | "import"
  | "type-import"
  | "export"
  | "jsx"
  | "call"
  | "reference";

export interface ReferenceEntry {
  file: string;
  line: number;
  column: number;
  isDefinition: boolean;
  kind: ReferenceKind;
}

export interface ReferencesRequest extends FileLocation {
  verbose?: boolean;
}

export interface ReferencesResult {
  references: ReferenceEntry[];
}
```

Update the `SemanticProvider` interface method:

```ts
// Before:
getReferences(location: FileLocation): Promise<ReferencesResult>;

// After:
getReferences(request: ReferencesRequest): Promise<ReferencesResult>;
```

- [ ] **Step 2: Update StaticSemanticProvider stub**

In `src/providers/static-semantic-provider.ts`, update the `getReferences`
stub signature to accept `ReferencesRequest` and add the `kind` import:

```ts
async getReferences(_request: ReferencesRequest = { file: "", line: 1, column: 1 }): Promise<ReferencesResult> {
  return { references: [] };
}
```

Add `ReferencesRequest` to the import from `semantic-provider.js`.

- [ ] **Step 3: Run existing tests to confirm they still pass**

```sh
pnpm test tests/providers/ tests/server.test.ts
```

Expected: all pass (the only consumer of `getReferences` is the provider test
which will be updated in Task 3).

- [ ] **Step 4: Commit**

```sh
git add src/providers/semantic-provider.ts src/providers/static-semantic-provider.ts
git commit -m "feat(slice-8): add ReferenceKind, ReferencesRequest, remove isWriteAccess"
```

---

## Task 2: Reference Classifier

**Files:**
- Create: `src/languages/typescript/reference-classifier.ts`
- Create: `tests/languages/typescript/reference-classifier.test.ts`

This is a pure function with no I/O. Write the tests first.

- [ ] **Step 1: Write failing tests**

Create `tests/languages/typescript/reference-classifier.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  type ClassifyInput,
  classifyReferences,
} from "../../../src/languages/typescript/reference-classifier.js";

// Helper: build a ClassifyInput from source lines and a list of {line,col} positions (1-based)
function input(source: string, refs: Array<{ line: number; column: number }>): ClassifyInput {
  return { lines: source.split("\n"), refs };
}

describe("classifyReferences", () => {
  it("tags reference inside a single-line import as import", () => {
    const src = `import { Button } from "./Button";`;
    const result = classifyReferences(input(src, [{ line: 1, column: 10 }]));
    expect(result[0]).toBe("import");
  });

  it("tags reference inside a multi-line import as import", () => {
    const src = [
      `import {`,
      `  Button,`,
      `  ButtonGroup,`,
      `} from "./Button";`,
    ].join("\n");
    // "Button" is on line 2, col 3
    const result = classifyReferences(input(src, [{ line: 2, column: 3 }]));
    expect(result[0]).toBe("import");
  });

  it("tags reference inside import type block as type-import", () => {
    const src = `import type { ButtonProps } from "./Button";`;
    const result = classifyReferences(input(src, [{ line: 1, column: 15 }]));
    expect(result[0]).toBe("type-import");
  });

  it("tags inline type specifier as type-import", () => {
    const src = `import { type ButtonProps, Button } from "./Button";`;
    // "ButtonProps" at col 16, "Button" at col 28
    const result = classifyReferences(
      input(src, [
        { line: 1, column: 16 },
        { line: 1, column: 28 },
      ]),
    );
    expect(result[0]).toBe("type-import");
    expect(result[1]).toBe("import");
  });

  it("tags reference inside multi-line import type as type-import", () => {
    const src = [
      `import type {`,
      `  ButtonProps,`,
      `} from "./Button";`,
    ].join("\n");
    const result = classifyReferences(input(src, [{ line: 2, column: 3 }]));
    expect(result[0]).toBe("type-import");
  });

  it("tags reference inside export block as export", () => {
    const src = `export { Button } from "./Button";`;
    const result = classifyReferences(input(src, [{ line: 1, column: 10 }]));
    expect(result[0]).toBe("export");
  });

  it("tags JSX usage as jsx", () => {
    const src = `return <Button onClick={fn} />;`;
    // "Button" at col 9 (preceded by "<")
    const result = classifyReferences(input(src, [{ line: 1, column: 9 }]));
    expect(result[0]).toBe("jsx");
  });

  it("tags call site as call", () => {
    const src = `const x = add(1, 2);`;
    // "add" at col 11
    const result = classifyReferences(input(src, [{ line: 1, column: 11 }]));
    expect(result[0]).toBe("call");
  });

  it("falls back to reference for unclassified usages", () => {
    const src = `const x: Button = value;`;
    // "Button" at col 10 (type annotation position)
    const result = classifyReferences(input(src, [{ line: 1, column: 10 }]));
    expect(result[0]).toBe("reference");
  });

  it("handles multiple refs in different positions in one call", () => {
    const src = [
      `import { add } from "./utils";`,
      `const x = add(1, 2);`,
    ].join("\n");
    const result = classifyReferences(
      input(src, [
        { line: 1, column: 10 }, // import
        { line: 2, column: 11 }, // call
      ]),
    );
    expect(result[0]).toBe("import");
    expect(result[1]).toBe("call");
  });

  it("tags definition position when provided", () => {
    const src = `export function add(a: number, b: number): number { return a + b; }`;
    // pass definitionPosition to override kind with "definition"
    const result = classifyReferences(
      {
        lines: src.split("\n"),
        refs: [{ line: 1, column: 17 }],
        definitionLine: 1,
        definitionColumn: 17,
      },
    );
    expect(result[0]).toBe("definition");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```sh
pnpm test tests/languages/typescript/reference-classifier.test.ts
```

Expected: import error (file does not exist).

- [ ] **Step 3: Implement reference-classifier.ts**

Create `src/languages/typescript/reference-classifier.ts`:

```ts
export type ReferenceKind =
  | "definition"
  | "import"
  | "type-import"
  | "export"
  | "jsx"
  | "call"
  | "reference";

export interface ClassifyInput {
  lines: string[];
  refs: Array<{ line: number; column: number }>; // 1-based
  definitionLine?: number;   // 1-based; if set, matching ref is tagged "definition"
  definitionColumn?: number; // 1-based
}

interface Span {
  startLine: number; // 1-based inclusive
  endLine: number;   // 1-based inclusive
  kind: "import" | "type-import" | "export";
}

export function classifyReferences(input: ClassifyInput): ReferenceKind[] {
  const spans = extractSpans(input.lines);
  return input.refs.map((ref) => classifyOne(ref, input.lines, spans, input));
}

function classifyOne(
  ref: { line: number; column: number },
  lines: string[],
  spans: Span[],
  input: ClassifyInput,
): ReferenceKind {
  // 1. Definition check (highest priority)
  if (
    input.definitionLine !== undefined &&
    input.definitionColumn !== undefined &&
    ref.line === input.definitionLine &&
    ref.column === input.definitionColumn
  ) {
    return "definition";
  }

  // 2. Span check (import / type-import / export)
  for (const span of spans) {
    if (ref.line >= span.startLine && ref.line <= span.endLine) {
      // Check for inline `type` keyword before the ref name within import spans
      if (span.kind === "import") {
        const lineText = lines[ref.line - 1] ?? "";
        const before = lineText.slice(0, ref.column - 1);
        if (/\btype\s+$/.test(before)) {
          return "type-import";
        }
      }
      return span.kind;
    }
  }

  // 3. JSX: character immediately before the ref on the same line is "<"
  const lineText = lines[ref.line - 1] ?? "";
  const charBefore = lineText[ref.column - 2]; // column is 1-based, so -2 for preceding char
  if (charBefore === "<") {
    return "jsx";
  }

  // 4. Call: after the ref token, the next non-whitespace/generic char is "("
  const afterRef = lineText.slice(ref.column - 1);
  // Strip an optional generic type parameter `<...>` before checking for "("
  const afterGeneric = afterRef.replace(/^[A-Za-z_$][\w$]*/, "").replace(/^<[^>]*>/, "");
  if (afterGeneric.trimStart().startsWith("(")) {
    return "call";
  }

  return "reference";
}

// Scan lines for import/export statement spans using brace counting.
function extractSpans(lines: string[]): Span[] {
  const spans: Span[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trimStart();

    // Match import or export statement start
    const importMatch = /^import\s+(type\s+)?/.exec(trimmed);
    const exportMatch = !importMatch && /^export\s+\{/.exec(trimmed);

    if (importMatch || exportMatch) {
      const isTypeImport = importMatch !== null && importMatch[1] !== undefined;
      const spanKind: Span["kind"] = exportMatch
        ? "export"
        : isTypeImport
          ? "type-import"
          : "import";

      const startLine = i + 1; // 1-based
      let endLine = startLine;

      // Walk forward until the statement ends (semicolon or closing brace at top level)
      let braceDepth = 0;
      for (let j = i; j < lines.length; j++) {
        const l = lines[j] ?? "";
        for (const ch of l) {
          if (ch === "{") braceDepth++;
          else if (ch === "}") braceDepth--;
        }
        if (l.includes(";") && braceDepth <= 0) {
          endLine = j + 1; // 1-based
          i = j; // outer loop will increment past this line
          break;
        }
        if (j === i && !l.includes("{") && !l.includes(";")) {
          // single-line import without braces (e.g. `import foo from "bar"`)
          endLine = j + 1;
          break;
        }
      }

      spans.push({ startLine, endLine, kind: spanKind });
    }

    i++;
  }

  return spans;
}
```

- [ ] **Step 4: Run classifier tests**

```sh
pnpm test tests/languages/typescript/reference-classifier.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```sh
git add src/languages/typescript/reference-classifier.ts tests/languages/typescript/reference-classifier.test.ts
git commit -m "feat(slice-8): add lexical block-aware reference classifier"
```

---

## Task 3: Provider Implementation

**Files:**
- Modify: `src/providers/lsp-semantic-provider.ts`
- Modify: `tests/providers/lsp-semantic-provider.test.ts`

- [ ] **Step 1: Write failing provider tests**

In `tests/providers/lsp-semantic-provider.test.ts`, add:

```ts
import { readFile } from "node:fs/promises";
// (add to existing imports at top)
```

Add these test cases (within the existing `describe` block, after existing tests):

```ts
it("getReferences returns kind on each entry", async () => {
  // Source with a known import reference
  const mockFileContent = `import { add } from "./utils";\nconst x = add(1,2);`;
  const mockConnection = {
    listen: vi.fn(),
    sendRequest: vi.fn().mockImplementation((method: { method: string }) => {
      if (method.method === "textDocument/references") {
        return Promise.resolve([
          { uri: "file:///project/index.ts", range: { start: { line: 0, character: 9 }, end: { line: 0, character: 12 } } },
          { uri: "file:///project/index.ts", range: { start: { line: 1, character: 10 }, end: { line: 1, character: 13 } } },
        ]);
      }
      // definition request - return the second occurrence as "definition"
      if (method.method === "textDocument/definition") {
        return Promise.resolve([
          { uri: "file:///project/utils.ts", range: { start: { line: 1, character: 16 }, end: { line: 1, character: 19 } } },
        ]);
      }
      return Promise.resolve(null);
    }),
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

  // Inject readFile that returns our mock content for the index.ts file
  const provider = new LspSemanticProvider({
    manager,
    readFile: async (_path: string) => mockFileContent,
  });

  const result = await provider.getReferences({
    file: "/project/index.ts",
    line: 1,
    column: 10,
  });

  expect(result.references.length).toBe(2);
  const kinds = result.references.map((r) => r.kind);
  expect(kinds).toContain("import");
  expect(kinds).toContain("call");
});

it("getReferences marks isDefinition=true when ref matches definition position", async () => {
  const mockFileContent = `export function add(a: number): number { return a; }`;
  const mockConnection = {
    listen: vi.fn(),
    sendRequest: vi.fn().mockImplementation((method: { method: string }) => {
      if (method.method === "textDocument/references") {
        return Promise.resolve([
          { uri: "file:///project/utils.ts", range: { start: { line: 0, character: 16 }, end: { line: 0, character: 19 } } },
        ]);
      }
      if (method.method === "textDocument/definition") {
        return Promise.resolve([
          { uri: "file:///project/utils.ts", range: { start: { line: 0, character: 16 }, end: { line: 0, character: 19 } } },
        ]);
      }
      return Promise.resolve(null);
    }),
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

  const provider = new LspSemanticProvider({
    manager,
    readFile: async (_path: string) => mockFileContent,
  });

  const result = await provider.getReferences({
    file: "/project/utils.ts",
    line: 1,
    column: 17,
  });

  expect(result.references.length).toBe(1);
  expect(result.references[0]?.isDefinition).toBe(true);
  expect(result.references[0]?.kind).toBe("definition");
});
```

- [ ] **Step 2: Run to verify failure**

```sh
pnpm test tests/providers/lsp-semantic-provider.test.ts
```

Expected: tests fail - provider does not yet accept `readFile` option and does
not return `kind`.

- [ ] **Step 3: Update LspSemanticProvider**

Add `readFile` option to `LspSemanticProviderOptions`:

```ts
import { readFile as fsReadFile } from "node:fs/promises";
// Add to existing imports

export interface LspSemanticProviderOptions {
  manager: LspProviderSessionManager | LspSessionManager;
  setupError?: SetupErrorInfo;
  readFile?: (path: string) => Promise<string>; // injectable for tests
}
```

Update the constructor to store it:

```ts
private readonly readFile: (path: string) => Promise<string>;

constructor(options: LspSemanticProviderOptions) {
  this.manager = options.manager;
  this.setupError = options.setupError;
  this.readFile = options.readFile ?? ((p) => fsReadFile(p, "utf8"));
}
```

Replace the `getReferences` method body with the enriched version:

```ts
async getReferences(request: ReferencesRequest): Promise<ReferencesResult> {
  const { info, session } = await this.manager.ensureSession(request.file);
  if (info.state !== "ready") {
    throw new Error(`LSP session not ready: ${info.message}`);
  }

  const uri = pathToFileURL(request.file).toString();
  const position = {
    line: request.line - 1,
    character: request.column - 1,
  };

  await session.prepareFile(request.file, languageIdForFile(request.file));

  const connection = session.getConnection();
  if (connection === undefined) throw new Error("LSP connection unavailable.");

  // Run references and definition in parallel (same connection, same session)
  const [rawRefs, rawDef] = await Promise.all([
    requestReferences(connection, uri, position),
    requestDefinition(connection, uri, position),
  ]);

  if (rawRefs === null) return { references: [] };

  // Resolve definition position (if available) for isDefinition matching
  type AnyLoc = {
    uri?: string;
    targetUri?: string;
    range?: { start: { line: number; character: number } };
    targetSelectionRange?: { start: { line: number; character: number } };
    targetRange?: { start: { line: number; character: number } };
  };
  let defFile: string | undefined;
  let defLine: number | undefined;
  let defColumn: number | undefined;
  if (rawDef !== null) {
    const defs = (Array.isArray(rawDef) ? rawDef : [rawDef]) as AnyLoc[];
    const first = defs[0];
    if (first !== undefined) {
      const targetUri = (first.targetUri ?? first.uri) as string | undefined;
      const range = first.targetSelectionRange ?? first.targetRange ?? first.range;
      if (targetUri !== undefined && range !== undefined) {
        defFile = fileURLToPath(targetUri);
        defLine = range.start.line + 1;
        defColumn = range.start.character + 1;
      }
    }
  }

  // Group refs by file for batched classification
  const refsByFile = new Map<string, Array<{ line: number; column: number; idx: number }>>();
  const allRefs = rawRefs.map((ref, idx) => {
    const file = fileURLToPath(ref.uri);
    const entry = { line: ref.range.start.line + 1, column: ref.range.start.character + 1, idx };
    const existing = refsByFile.get(file) ?? [];
    refsByFile.set(file, [...existing, entry]);
    return { file, line: entry.line, column: entry.column };
  });

  // Classify per file (read each file once)
  const kindByIdx = new Map<number, ReferenceKind>();
  for (const [file, fileRefs] of refsByFile) {
    let lines: string[];
    try {
      const content = await this.readFile(file);
      lines = content.split("\n");
    } catch {
      // If file unreadable, fall back to "reference" for all refs in it
      for (const r of fileRefs) kindByIdx.set(r.idx, "reference");
      continue;
    }
    const classified = classifyReferences({
      lines,
      refs: fileRefs,
      definitionLine: file === defFile ? defLine : undefined,
      definitionColumn: file === defFile ? defColumn : undefined,
    });
    for (let i = 0; i < fileRefs.length; i++) {
      const r = fileRefs[i];
      const k = classified[i];
      if (r !== undefined && k !== undefined) kindByIdx.set(r.idx, k);
    }
  }

  return {
    references: allRefs.map((ref, idx) => ({
      file: ref.file,
      line: ref.line,
      column: ref.column,
      isDefinition: ref.file === defFile && ref.line === defLine && ref.column === defColumn,
      kind: kindByIdx.get(idx) ?? "reference",
    })),
  };
}
```

Add to imports in `lsp-semantic-provider.ts`:

```ts
import { readFile as fsReadFile } from "node:fs/promises";
import {
  classifyReferences,
  type ReferenceKind,
} from "../languages/typescript/reference-classifier.js";
import type {
  // ... existing ...
  ReferencesRequest,
} from "./semantic-provider.js";
```

- [ ] **Step 4: Run provider tests**

```sh
pnpm test tests/providers/
```

Expected: all pass.

- [ ] **Step 5: Commit**

```sh
git add src/providers/lsp-semantic-provider.ts tests/providers/lsp-semantic-provider.test.ts
git commit -m "feat(slice-8): enrich getReferences with kind classification and isDefinition"
```

---

## Task 4: Tool Formatter

**Files:**
- Modify: `src/tools/references.ts`
- Modify: `tests/tools/references.test.ts`

- [ ] **Step 1: Write failing tests**

Replace the content of `tests/tools/references.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import type {
  ReferenceEntry,
  ReferencesResult,
} from "../../src/providers/semantic-provider.js";
import { formatReferencesResult } from "../../src/tools/references.js";

const loc = { file: "/src/Button.tsx", line: 12, column: 14 };

function ref(file: string, line: number, column: number, kind: ReferenceEntry["kind"], isDefinition = false): ReferenceEntry {
  return { file, line, column, isDefinition, kind };
}

describe("formatReferencesResult - compact (default)", () => {
  it("shows total count and per-file kind breakdown", () => {
    const result: ReferencesResult = {
      references: [
        ref("/src/Button.tsx", 12, 14, "definition", true),
        ref("/src/Button.tsx", 45, 3, "call"),
        ref("/src/Button.tsx", 67, 12, "call"),
        ref("/src/ButtonGroup.tsx", 2, 10, "import"),
        ref("/src/ButtonGroup.tsx", 5, 7, "call"),
      ],
    };
    const text = formatReferencesResult(loc, result, { verbose: false });
    expect(text).toContain("5 references");
    expect(text).toContain("2 files");
    expect(text).toContain("/src/Button.tsx");
    expect(text).toContain("1 def");
    expect(text).toContain("2 call");
    expect(text).toContain("/src/ButtonGroup.tsx");
    expect(text).toContain("1 import");
    expect(text).not.toContain("L12:14");  // no positions in compact mode
  });

  it("shows no references message when empty", () => {
    const result: ReferencesResult = { references: [] };
    const text = formatReferencesResult(loc, result, { verbose: false });
    expect(text).toContain("No references");
  });
});

describe("formatReferencesResult - verbose", () => {
  it("shows per-file position list with kind tags", () => {
    const result: ReferencesResult = {
      references: [
        ref("/src/Button.tsx", 12, 14, "definition", true),
        ref("/src/Button.tsx", 45, 3, "call"),
        ref("/src/index.ts", 1, 10, "import"),
      ],
    };
    const text = formatReferencesResult(loc, result, { verbose: true });
    expect(text).toContain("L12:14");
    expect(text).toContain("[definition]");
    expect(text).toContain("L45:3");
    expect(text).toContain("[call]");
    expect(text).toContain("L1:10");
    expect(text).toContain("[import]");
  });

  it("truncates at limit and appends overflow message", () => {
    const refs = Array.from({ length: 10 }, (_, i) =>
      ref("/src/a.ts", i + 1, 1, "call"),
    );
    const result: ReferencesResult = { references: refs };
    const text = formatReferencesResult(loc, result, { verbose: true, limit: 5 });
    expect(text).toContain("... and 5 more");
    // only 5 positions shown
    const posLines = text.split("\n").filter((l) => l.trim().startsWith("L"));
    expect(posLines.length).toBe(5);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```sh
pnpm test tests/tools/references.test.ts
```

Expected: fails - `formatReferencesResult` signature differs.

- [ ] **Step 3: Rewrite src/tools/references.ts**

```ts
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  FileLocation,
  ReferenceEntry,
  ReferencesRequest,
  ReferencesResult,
  SemanticProvider,
} from "../providers/semantic-provider.js";
import { textResult } from "./text-result.js";

export interface FormatOptions {
  verbose?: boolean;
  limit?: number;
}

export function formatReferencesResult(
  location: FileLocation,
  result: ReferencesResult,
  options: FormatOptions = {},
): string {
  const { verbose = false, limit = 50 } = options;

  if (result.references.length === 0) {
    return `No references found for symbol at ${location.file}:${location.line}:${location.column}`;
  }

  // Group by file
  const byFile = new Map<string, ReferenceEntry[]>();
  for (const ref of result.references) {
    const existing = byFile.get(ref.file) ?? [];
    byFile.set(ref.file, [...existing, ref]);
  }

  if (!verbose) {
    // Compact: summary header + per-file kind breakdown
    const lines = [
      `References for symbol at ${location.file}:${location.line}:${location.column}\n`,
      `  ${result.references.length} references across ${byFile.size} file(s)`,
    ];
    for (const [file, refs] of byFile) {
      const kindCounts = new Map<string, number>();
      for (const r of refs) {
        kindCounts.set(r.kind, (kindCounts.get(r.kind) ?? 0) + 1);
      }
      const breakdown = [...kindCounts.entries()]
        .map(([k, n]) => (k === "definition" ? `${n} def` : `${n} ${k}`))
        .join(", ");
      lines.push(`  ${file}: ${refs.length} (${breakdown})`);
    }
    return lines.join("\n");
  }

  // Verbose: per-file position list with kind tags, truncated at limit
  const header = `References (${result.references.length} total) for symbol at ${location.file}:${location.line}:${location.column}\n`;
  const lines: string[] = [header];

  let shown = 0;
  let overflow = 0;

  for (const [file, refs] of byFile) {
    if (shown >= limit) {
      overflow += refs.length;
      continue;
    }
    lines.push(`  ${file}:`);
    for (const ref of refs) {
      if (shown < limit) {
        lines.push(`    L${ref.line}:${ref.column}  [${ref.kind}]`);
        shown++;
      } else {
        overflow++;
      }
    }
  }

  if (overflow > 0) {
    lines.push(`  ... and ${overflow} more (use verbose:true with a higher limit)`);
  }

  return lines.join("\n");
}

export function createReferencesTool(
  provider: SemanticProvider,
  options: { limit?: number } = {},
) {
  return async function findReferences(
    input: ReferencesRequest,
  ): Promise<CallToolResult> {
    const result = await provider.getReferences(input);
    return textResult(
      formatReferencesResult(input, result, {
        verbose: input.verbose ?? false,
        limit: options.limit,
      }),
    );
  };
}
```

- [ ] **Step 4: Run formatter tests**

```sh
pnpm test tests/tools/references.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```sh
git add src/tools/references.ts tests/tools/references.test.ts
git commit -m "feat(slice-8): compact default output and verbose opt-in for find_references"
```

---

## Task 5: Server Wiring, Description & Instrumentation

**Files:**
- Modify: `src/server.ts`
- Modify: `tests/server.test.ts`

- [ ] **Step 1: Write failing server tests**

Add to `tests/server.test.ts`:

```ts
import { vi } from "vitest";

describe("withInstrumentation", () => {
  it("does not emit to stderr when LSP_MCP_DEBUG is unset", async () => {
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    delete process.env.LSP_MCP_DEBUG;

    const { withInstrumentation } = await import("../../src/server.js");
    const handler = withInstrumentation("test_tool", async () => ({
      content: [{ type: "text" as const, text: "ok" }],
    }));
    await handler({});

    expect(stderrWrite).not.toHaveBeenCalled();
    stderrWrite.mockRestore();
  });

  it("writes to stderr (not stdout) when LSP_MCP_DEBUG is set", async () => {
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    process.env.LSP_MCP_DEBUG = "1";

    const { withInstrumentation } = await import("../../src/server.js");
    const handler = withInstrumentation("test_tool", async () => ({
      content: [{ type: "text" as const, text: "hello world" }],
    }));
    await handler({});

    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining("test_tool"));
    expect(stdoutWrite).not.toHaveBeenCalled();
    delete process.env.LSP_MCP_DEBUG;
    stderrWrite.mockRestore();
    stdoutWrite.mockRestore();
  });
});
```

Run to verify failure:

```sh
pnpm test tests/server.test.ts
```

- [ ] **Step 2: Add `ServerOptions`, `withInstrumentation`, and updated `find_references` to server.ts**

Add `ServerOptions` interface and export `withInstrumentation`:

```ts
export interface ServerOptions {
  outputLimit?: number;
}

export function withInstrumentation<T extends object>(
  toolName: string,
  handler: (input: T) => Promise<{ content: Array<{ type: string; text?: string }> }>,
): (input: T) => Promise<{ content: Array<{ type: string; text?: string }> }> {
  return async (input: T) => {
    const start = Date.now();
    const result = await handler(input);
    if (process.env.LSP_MCP_DEBUG) {
      const bytes = result.content
        .filter((c) => c.type === "text")
        .reduce((sum, c) => sum + (c.text?.length ?? 0), 0);
      process.stderr.write(
        `[lsp-mcp] ${toolName} ${Date.now() - start}ms ${bytes} bytes\n`,
      );
    }
    return result;
  };
}
```

Update `createServer` signature:

```ts
export function createServer(
  dependencies: ServerDependencies = {},
  options: ServerOptions = {},
): McpServer {
  const provider = dependencies.provider ?? new StaticSemanticProvider();
  const outputLimit = options.outputLimit;
  // ...
```

Update `find_references` registration to pass `outputLimit` and new description:

```ts
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
```

Update `startStdioServer` to pass the config limit:

```ts
export async function startStdioServer(): Promise<void> {
  const provider = await createDefaultProvider();
  // Load config a second time to get outputLimit (or thread it from createDefaultProvider)
  const configResult = await loadConfig();
  const outputLimit =
    configResult.ok ? configResult.config.output.defaultLimit : undefined;
  const server = createServer({ provider }, { outputLimit });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

- [ ] **Step 3: Run server tests**

```sh
pnpm test tests/server.test.ts
```

Expected: all pass.

- [ ] **Step 4: Run full test suite**

```sh
pnpm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```sh
git add src/server.ts tests/server.test.ts
git commit -m "feat(slice-8): ServerOptions outputLimit, withInstrumentation, updated find_references description"
```

---

## Task 6: Integration Tests

**Files:**
- Modify: `tests/integration/semantic-tools.test.ts`

`add` in `utils.ts` is imported on line 1 of `index.ts` and called on line 3.
The LSP `find_references` on `add` at `utils.ts:2:17` should return at least
an import reference and a call reference.

- [ ] **Step 1: Add integration tests**

Append to `tests/integration/semantic-tools.test.ts` (inside the existing
`describe` block, after the last existing test):

```ts
it("getReferences on add returns kind tags including import and call", async () => {
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

  // utils.ts line 2: `export function add(a: number, b: number): number {`
  // "add" starts at column 17 (1-based)
  const result = await provider.getReferences({
    file: UTILS_FILE,
    line: 2,
    column: 17,
  });

  expect(result.references.length).toBeGreaterThan(0);
  const kinds = result.references.map((r) => r.kind);
  // definition in utils.ts
  expect(kinds).toContain("definition");
  // used in index.ts as import and call
  expect(kinds.some((k) => k === "import" || k === "call")).toBe(true);
}, 15_000);

it("compact formatReferencesResult for add contains file and kind summary", async () => {
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

  const result = await provider.getReferences({
    file: UTILS_FILE,
    line: 2,
    column: 17,
  });

  const { formatReferencesResult } = await import("../../src/tools/references.js");
  const text = formatReferencesResult(
    { file: UTILS_FILE, line: 2, column: 17 },
    result,
    { verbose: false },
  );

  expect(text).toContain("references");
  expect(text).toContain("utils.ts");
  // Should NOT contain raw L<n>:<n> position lines in compact mode
  expect(text).not.toMatch(/^\s+L\d+:\d+/m);
}, 15_000);
```

- [ ] **Step 2: Run integration tests**

```sh
pnpm test tests/integration/
```

Expected: all pass (may take ~30s for LSP startup).

- [ ] **Step 3: Run full suite + checks + build**

```sh
pnpm test && pnpm check && pnpm build
```

Expected: all pass, zero type errors, clean build.

- [ ] **Step 4: Commit**

```sh
git add tests/integration/semantic-tools.test.ts
git commit -m "test(slice-8): integration tests for enriched find_references kinds"
```

---

## Acceptance

After all tasks complete, run:

```sh
pnpm test
pnpm check
pnpm build
```

All commands must pass with zero errors.

Verify manually via the MCP inspector or `npx @modelcontextprotocol/inspector`:
- `find_references` on any symbol returns compact summary by default.
- `find_references` with `verbose: true` returns position lines with kind tags.
- `LSP_MCP_DEBUG=1 node dist/cli.js` logs `[lsp-mcp] find_references Xms Y bytes` to stderr on each call.
