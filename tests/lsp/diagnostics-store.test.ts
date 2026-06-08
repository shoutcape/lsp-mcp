// tests/lsp/diagnostics-store.test.ts
import { describe, expect, it } from "vitest";
import { DiagnosticsStore } from "../../src/lsp/diagnostics-store.js";

const mockRange = {
  start: { line: 0, character: 0 },
  end: { line: 0, character: 5 },
};

describe("DiagnosticsStore", () => {
  it("stores diagnostics when onDiagnostics is called", () => {
    const store = new DiagnosticsStore();
    store.onDiagnostics({
      uri: "file:///a.ts",
      diagnostics: [{ range: mockRange, message: "error msg", severity: 1 }],
    });

    expect(store.getDiagnostics("file:///a.ts")).toHaveLength(1);
    expect(store.getDiagnostics("file:///a.ts")[0].message).toBe("error msg");
  });

  it("returns empty array for unknown URI", () => {
    const store = new DiagnosticsStore();
    expect(store.getDiagnostics("file:///unknown.ts")).toEqual([]);
  });

  it("resolves waitForDiagnostics when notification arrives", async () => {
    const store = new DiagnosticsStore();
    const promise = store.waitForDiagnostics("file:///a.ts", 500);

    setTimeout(() => {
      store.onDiagnostics({
        uri: "file:///a.ts",
        diagnostics: [{ range: mockRange, message: "late error", severity: 1 }],
      });
    }, 20);

    const result = await promise;
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe("late error");
  });

  it("returns empty array on timeout", async () => {
    const store = new DiagnosticsStore();
    const result = await store.waitForDiagnostics("file:///a.ts", 50);
    expect(result).toEqual([]);
  });

  it("returns immediately if diagnostics already stored", async () => {
    const store = new DiagnosticsStore();
    store.onDiagnostics({
      uri: "file:///a.ts",
      diagnostics: [{ range: mockRange, message: "existing", severity: 1 }],
    });

    const result = await store.waitForDiagnostics("file:///a.ts", 500);
    expect(result).toHaveLength(1);
  });

  it("tracks revisions per URI", () => {
    const store = new DiagnosticsStore();

    expect(store.getRevision("file:///a.ts")).toBe(0);

    store.onDiagnostics({
      uri: "file:///a.ts",
      diagnostics: [{ range: mockRange, message: "first", severity: 1 }],
    });

    expect(store.getRevision("file:///a.ts")).toBe(1);

    store.onDiagnostics({
      uri: "file:///a.ts",
      diagnostics: [{ range: mockRange, message: "second", severity: 1 }],
    });

    expect(store.getRevision("file:///a.ts")).toBe(2);
  });

  it("waits for diagnostics after a revision", async () => {
    const store = new DiagnosticsStore();

    store.onDiagnostics({
      uri: "file:///a.ts",
      diagnostics: [{ range: mockRange, message: "old", severity: 1 }],
    });

    const revision = store.getRevision("file:///a.ts");
    const promise = store.waitForDiagnosticsAfter(
      "file:///a.ts",
      revision,
      500,
    );

    setTimeout(() => {
      store.onDiagnostics({
        uri: "file:///a.ts",
        diagnostics: [{ range: mockRange, message: "new", severity: 1 }],
      });
    }, 20);

    const result = await promise;
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe("new");
  });
});
