import { describe, expect, it } from "vitest";
import type {
  CallHierarchyRequest,
  CallHierarchyResult,
} from "../../src/providers/semantic-provider.js";
import { formatCallHierarchyResult } from "../../src/tools/call-hierarchy.js";

describe("formatCallHierarchyResult", () => {
  const request: CallHierarchyRequest = {
    file: "/src/utils.ts",
    line: 2,
    column: 17,
    direction: "both",
  };

  it("reports no item found", () => {
    const result: CallHierarchyResult = { item: null };
    const text = formatCallHierarchyResult(request, result);
    expect(text).toContain("No call hierarchy item");
    expect(text).toContain("/src/utils.ts:2:17");
  });

  it("formats incoming calls", () => {
    const result: CallHierarchyResult = {
      item: {
        name: "add",
        kind: "function",
        file: "/src/utils.ts",
        line: 2,
        column: 17,
      },
      incoming: [
        {
          from: {
            name: "main",
            kind: "function",
            file: "/src/index.ts",
            line: 6,
            column: 1,
            containerName: "<module>",
          },
        },
      ],
    };
    const text = formatCallHierarchyResult(
      { ...request, direction: "incoming" },
      result,
    );
    expect(text).toContain("add [function]");
    expect(text).toContain("Incoming calls (1)");
    expect(text).toContain("<- main");
    expect(text).toContain("(in <module>)");
    expect(text).toContain("/src/index.ts:6");
  });

  it("formats outgoing calls", () => {
    const result: CallHierarchyResult = {
      item: {
        name: "main",
        kind: "function",
        file: "/src/index.ts",
        line: 6,
        column: 1,
      },
      outgoing: [
        {
          to: {
            name: "add",
            kind: "function",
            file: "/src/utils.ts",
            line: 2,
            column: 17,
          },
        },
        {
          to: {
            name: "createGreeting",
            kind: "function",
            file: "/src/utils.ts",
            line: 12,
            column: 1,
          },
        },
      ],
    };
    const text = formatCallHierarchyResult(
      { ...request, direction: "outgoing" },
      result,
    );
    expect(text).toContain("Outgoing calls (2)");
    expect(text).toContain("-> add [function]");
    expect(text).toContain("-> createGreeting [function]");
  });

  it("shows both incoming and outgoing", () => {
    const result: CallHierarchyResult = {
      item: {
        name: "add",
        kind: "function",
        file: "/src/utils.ts",
        line: 2,
        column: 17,
      },
      incoming: [
        {
          from: {
            name: "main",
            kind: "function",
            file: "/src/index.ts",
            line: 6,
            column: 1,
          },
        },
      ],
      outgoing: [],
    };
    const text = formatCallHierarchyResult(request, result);
    expect(text).toContain("Incoming calls (1)");
    expect(text).toContain("Outgoing calls (0)");
    expect(text).toContain("(none)");
  });
});
