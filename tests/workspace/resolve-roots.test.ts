import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveWorkspaceRoots } from "../../src/workspace/resolve-roots.js";

describe("resolveWorkspaceRoots", () => {
  it("returns empty roots when input is empty", () => {
    const result = resolveWorkspaceRoots({ roots: [], baseDir: "/repo" });

    expect(result).toEqual({ ok: true, roots: [] });
  });

  it("resolves relative roots against the explicit base directory", () => {
    const result = resolveWorkspaceRoots({ roots: ["src"], baseDir: "/repo" });

    expect(result).toEqual({
      ok: true,
      roots: [{ path: path.join("/repo", "src") }],
    });
  });

  it("preserves absolute roots", () => {
    const result = resolveWorkspaceRoots({
      roots: ["/other/project"],
      baseDir: "/repo",
    });

    expect(result).toEqual({ ok: true, roots: [{ path: "/other/project" }] });
  });

  it("normalizes root paths without reading the filesystem", () => {
    const result = resolveWorkspaceRoots({
      roots: ["packages/../app"],
      baseDir: "/repo",
    });

    expect(result).toEqual({ ok: true, roots: [{ path: "/repo/app" }] });
  });
});
