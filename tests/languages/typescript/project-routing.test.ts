import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { defaultConfig } from "../../../src/config/config.js";
import { createTypeScriptPreset } from "../../../src/languages/typescript/preset.js";
import { routeTypeScriptProject } from "../../../src/languages/typescript/project-routing.js";

const preset = createTypeScriptPreset(defaultConfig.languages.typescript);

describe("routeTypeScriptProject", () => {
  it("uses the nearest tsconfig.json directory as project anchor", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "lsp-mcp-route-"));
    const appDir = path.join(root, "packages", "app");
    await mkdir(path.join(appDir, "src"), { recursive: true });
    await writeFile(path.join(root, "tsconfig.json"), "{}");
    await writeFile(path.join(appDir, "tsconfig.json"), "{}");
    await writeFile(path.join(appDir, "src", "index.ts"), "");

    const result = await routeTypeScriptProject({
      requestedPath: "packages/app/src/index.ts",
      roots: [{ path: root }],
      preset,
    });

    expect(result).toEqual({
      ok: true,
      path: path.join(appDir, "src", "index.ts"),
      root: { path: root },
      projectAnchor: appDir,
      languageId: "typescript",
    });
  });

  it("falls back to the nearest package.json directory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "lsp-mcp-route-"));
    const appDir = path.join(root, "packages", "app");
    await mkdir(path.join(appDir, "src"), { recursive: true });
    await writeFile(path.join(root, "package.json"), "{}");
    await writeFile(path.join(appDir, "package.json"), "{}");
    await writeFile(path.join(appDir, "src", "index.ts"), "");

    const result = await routeTypeScriptProject({
      requestedPath: "packages/app/src/index.ts",
      roots: [{ path: root }],
      preset,
    });

    expect(result).toEqual({
      ok: true,
      path: path.join(appDir, "src", "index.ts"),
      root: { path: root },
      projectAnchor: appDir,
      languageId: "typescript",
    });
  });

  it("prefers ancestor tsconfig.json over nearer package.json", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "lsp-mcp-route-"));
    const appDir = path.join(root, "packages", "app");
    await mkdir(path.join(appDir, "src"), { recursive: true });
    await writeFile(path.join(root, "tsconfig.json"), "{}");
    await writeFile(path.join(appDir, "package.json"), "{}");
    await writeFile(path.join(appDir, "src", "index.ts"), "");

    const result = await routeTypeScriptProject({
      requestedPath: "packages/app/src/index.ts",
      roots: [{ path: root }],
      preset,
    });

    expect(result).toEqual({
      ok: true,
      path: path.join(appDir, "src", "index.ts"),
      root: { path: root },
      projectAnchor: root,
      languageId: "typescript",
    });
  });

  it("falls back to the owning workspace root when no markers exist", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "lsp-mcp-route-"));
    await mkdir(path.join(root, "packages", "app", "src"), { recursive: true });
    await writeFile(path.join(root, "packages", "app", "src", "index.ts"), "");

    const result = await routeTypeScriptProject({
      requestedPath: "packages/app/src/index.ts",
      roots: [{ path: root }],
      preset,
    });

    expect(result).toEqual({
      ok: true,
      path: path.join(root, "packages", "app", "src", "index.ts"),
      root: { path: root },
      projectAnchor: root,
      languageId: "typescript",
    });
  });

  it("skips configured project markers that escape the workspace root", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "lsp-mcp-route-"));
    const root = path.join(tempDir, "root");
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "index.ts"), "");
    await writeFile(path.join(tempDir, "outside"), "not a directory");
    const unsafeMarkerPreset = createTypeScriptPreset({
      ...defaultConfig.languages.typescript,
      projectMarkers: ["../outside/package.json"],
    });

    const result = await routeTypeScriptProject({
      requestedPath: "src/index.ts",
      roots: [{ path: root }],
      preset: unsafeMarkerPreset,
    });

    expect(result).toEqual({
      ok: true,
      path: path.join(root, "src", "index.ts"),
      root: { path: root },
      projectAnchor: root,
      languageId: "typescript",
    });
  });

  it("rejects unsupported extensions before checking project markers", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "lsp-mcp-route-"));
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "readme.md"), "");

    const result = await routeTypeScriptProject({
      requestedPath: "src/readme.md",
      roots: [{ path: root }],
      preset,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "unsupported_file_type",
        message: "Unsupported TypeScript file extension: src/readme.md",
      },
    });
  });

  it("rejects unsafe paths before checking file extension", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "lsp-mcp-route-"));
    const outside = await mkdtemp(path.join(os.tmpdir(), "lsp-mcp-outside-"));

    const result = await routeTypeScriptProject({
      requestedPath: path.join(outside, "readme.md"),
      roots: [{ path: root }],
      preset,
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
