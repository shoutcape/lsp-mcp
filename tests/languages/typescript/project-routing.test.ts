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

  describe("with no configured roots", () => {
    it("uses nearest tsconfig.json as project anchor when no roots configured", async () => {
      const tempDir = await mkdtemp(path.join(os.tmpdir(), "lsp-mcp-infer-"));
      const srcDir = path.join(tempDir, "src");
      await mkdir(srcDir, { recursive: true });
      await writeFile(path.join(tempDir, "tsconfig.json"), "{}");
      await writeFile(path.join(srcDir, "index.ts"), "");

      const result = await routeTypeScriptProject({
        requestedPath: path.join(srcDir, "index.ts"),
        roots: [],
        preset,
      });

      expect(result).toEqual({
        ok: true,
        path: path.join(srcDir, "index.ts"),
        root: { path: tempDir },
        projectAnchor: tempDir,
        languageId: "typescript",
      });
    });

    it("uses nearest package.json as project anchor when no tsconfig.json exists", async () => {
      const tempDir = await mkdtemp(path.join(os.tmpdir(), "lsp-mcp-infer-"));
      const srcDir = path.join(tempDir, "src");
      await mkdir(srcDir, { recursive: true });
      await writeFile(path.join(tempDir, "package.json"), "{}");
      await writeFile(path.join(srcDir, "index.ts"), "");

      const result = await routeTypeScriptProject({
        requestedPath: path.join(srcDir, "index.ts"),
        roots: [],
        preset,
      });

      expect(result).toEqual({
        ok: true,
        path: path.join(srcDir, "index.ts"),
        root: { path: tempDir },
        projectAnchor: tempDir,
        languageId: "typescript",
      });
    });

    it("falls back to file directory when no project markers found", async () => {
      const tempDir = await mkdtemp(path.join(os.tmpdir(), "lsp-mcp-infer-"));
      const srcDir = path.join(tempDir, "src");
      await mkdir(srcDir, { recursive: true });
      await writeFile(path.join(srcDir, "index.ts"), "");
      // no tsconfig.json or package.json anywhere in tempDir

      const result = await routeTypeScriptProject({
        requestedPath: path.join(srcDir, "index.ts"),
        roots: [],
        preset,
      });

      expect(result).toEqual({
        ok: true,
        path: path.join(srcDir, "index.ts"),
        root: { path: srcDir },
        projectAnchor: srcDir,
        languageId: "typescript",
      });
    });

    it("rejects unsupported extensions even with no roots configured", async () => {
      const tempDir = await mkdtemp(path.join(os.tmpdir(), "lsp-mcp-infer-"));
      await writeFile(path.join(tempDir, "readme.md"), "");

      const result = await routeTypeScriptProject({
        requestedPath: path.join(tempDir, "readme.md"),
        roots: [],
        preset,
      });

      expect(result).toMatchObject({
        ok: false,
        error: { code: "unsupported_file_type" },
      });
    });
  });
});
