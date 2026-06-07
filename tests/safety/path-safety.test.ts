import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveSafePath } from "../../src/safety/path-safety.js";

const root = { path: "/repo" };

describe("resolveSafePath", () => {
  it("rejects an empty requested path", () => {
    const result = resolveSafePath({ requestedPath: "", roots: [root] });

    expect(result).toEqual({
      ok: false,
      error: { code: "empty_path", message: "Requested path is empty." },
    });
  });

  it("rejects missing workspace roots", () => {
    const result = resolveSafePath({
      requestedPath: "src/index.ts",
      roots: [],
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "no_workspace_roots",
        message: "No workspace roots configured.",
      },
    });
  });

  it("rejects relative root paths instead of resolving them against cwd", () => {
    const result = resolveSafePath({
      requestedPath: "src/index.ts",
      roots: [{ path: "repo" }],
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "path_outside_workspace",
        message: "Requested path is outside configured workspace roots.",
      },
    });
  });

  it("resolves a relative path inside the first workspace root", () => {
    const result = resolveSafePath({
      requestedPath: "src/index.ts",
      roots: [root],
    });

    expect(result).toEqual({
      ok: true,
      root,
      path: path.join("/repo", "src", "index.ts"),
    });
  });

  it("accepts an absolute path inside a workspace root", () => {
    const result = resolveSafePath({
      requestedPath: "/repo/src/index.ts",
      roots: [root],
    });

    expect(result).toEqual({
      ok: true,
      root,
      path: "/repo/src/index.ts",
    });
  });

  it("rejects a relative path that escapes with parent segments", () => {
    const result = resolveSafePath({
      requestedPath: "../outside.ts",
      roots: [root],
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "path_outside_workspace",
        message: "Requested path is outside configured workspace roots.",
      },
    });
  });

  it("rejects absolute paths outside configured roots", () => {
    const result = resolveSafePath({
      requestedPath: "/outside/index.ts",
      roots: [root],
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "path_outside_workspace",
        message: "Requested path is outside configured workspace roots.",
      },
    });
  });

  it("rejects sibling-prefix paths that only look like they are inside a root", () => {
    const result = resolveSafePath({
      requestedPath: "/repo-other/src/index.ts",
      roots: [root],
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "path_outside_workspace",
        message: "Requested path is outside configured workspace roots.",
      },
    });
  });
});
