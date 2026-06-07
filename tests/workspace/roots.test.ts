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
