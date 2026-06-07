import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { defaultConfig, type LspMcpConfig } from "../../src/config/config.js";
import {
  type LoadConfigResult,
  loadConfig,
} from "../../src/config/load-config.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "lsp-mcp-config-"));
  tempDirs.push(dir);
  return dir;
}

function expectLoaded(result: LoadConfigResult): LspMcpConfig {
  if (!result.ok) {
    throw new Error(`Expected config to load, got ${result.error.code}`);
  }

  return result.config;
}

describe("loadConfig", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs
        .splice(0)
        .map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("returns defaults when no optional config exists in the base directory", async () => {
    const baseDir = await createTempDir();

    const result = await loadConfig({ baseDir });

    expect(result).toMatchObject({ ok: true, config: defaultConfig, baseDir });
  });

  it("returns config arrays that do not share defaultConfig references", async () => {
    const baseDir = await createTempDir();

    const config = expectLoaded(await loadConfig({ baseDir }));

    expect(config.roots).not.toBe(defaultConfig.roots);
    expect(config.languages.typescript.command).not.toBe(
      defaultConfig.languages.typescript.command,
    );
    expect(config.languages.typescript.extensions).not.toBe(
      defaultConfig.languages.typescript.extensions,
    );
    expect(config.languages.typescript.projectMarkers).not.toBe(
      defaultConfig.languages.typescript.projectMarkers,
    );
  });

  it("parses JSONC comments and trailing commas", async () => {
    const baseDir = await createTempDir();
    await writeFile(
      path.join(baseDir, "lsp-mcp.config.jsonc"),
      `{
        // comments are valid JSONC
        "roots": ["."],
        "output": {
          "defaultLimit": 25,
        },
      }`,
    );

    const config = expectLoaded(await loadConfig({ baseDir }));

    expect(config.roots).toEqual(["."]);
    expect(config.output.defaultLimit).toBe(25);
  });

  it("deep merges partial config with defaults", async () => {
    const baseDir = await createTempDir();
    await writeFile(
      path.join(baseDir, "lsp-mcp.config.jsonc"),
      JSON.stringify({
        languages: {
          typescript: {
            command: ["custom-ts-ls", "--stdio"],
          },
        },
      }),
    );

    const config = expectLoaded(await loadConfig({ baseDir }));

    expect(config.languages.typescript.command).toEqual([
      "custom-ts-ls",
      "--stdio",
    ]);
    expect(config.languages.typescript.enabled).toBe(true);
    expect(config.languages.typescript.extensions).toEqual(
      defaultConfig.languages.typescript.extensions,
    );
    expect(config.output.defaultLimit).toBe(defaultConfig.output.defaultLimit);
  });

  it("returns a parse error for invalid JSONC", async () => {
    const baseDir = await createTempDir();
    await writeFile(path.join(baseDir, "lsp-mcp.config.jsonc"), "{");

    const result = await loadConfig({ baseDir });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "config_parse_error" },
    });
  });

  it("returns a validation error for invalid config values", async () => {
    const baseDir = await createTempDir();
    await writeFile(
      path.join(baseDir, "lsp-mcp.config.jsonc"),
      JSON.stringify({ output: { defaultLimit: 0 } }),
    );

    const result = await loadConfig({ baseDir });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "config_validation_error" },
    });
  });

  it("returns a validation error for unknown fields", async () => {
    const baseDir = await createTempDir();
    await writeFile(
      path.join(baseDir, "lsp-mcp.config.jsonc"),
      JSON.stringify({ unexpected: true }),
    );

    const result = await loadConfig({ baseDir });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "config_validation_error" },
    });
  });

  it("returns a validation error for unknown nested fields", async () => {
    const baseDir = await createTempDir();
    await writeFile(
      path.join(baseDir, "lsp-mcp.config.jsonc"),
      JSON.stringify({ languages: { typescript: { unexpected: true } } }),
    );

    const result = await loadConfig({ baseDir });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "config_validation_error" },
    });
  });

  it("returns not found when an explicit config path is missing", async () => {
    const baseDir = await createTempDir();

    const result = await loadConfig({
      configPath: path.join(baseDir, "missing.jsonc"),
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "config_not_found" },
    });
  });

  it("returns a read error when an explicit config path is a directory", async () => {
    const baseDir = await createTempDir();
    const configPath = path.join(baseDir, "config-dir");
    await mkdir(configPath);

    const result = await loadConfig({ configPath });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "config_read_error" },
    });
  });

  it("returns absolute baseDir from explicit base directory", async () => {
    const baseDir = await createTempDir();

    const result = await loadConfig({ baseDir });

    expect(result).toMatchObject({ ok: true, baseDir: path.resolve(baseDir) });
  });

  it("returns config file directory as baseDir for relative config paths", async () => {
    const cwd = process.cwd();
    const tempDir = await createTempDir();
    const nestedDir = path.join(tempDir, "nested");
    await mkdir(nestedDir);
    await writeFile(path.join(nestedDir, "custom.jsonc"), JSON.stringify({}));

    try {
      process.chdir(tempDir);

      const result = await loadConfig({ configPath: "nested/custom.jsonc" });

      expect(result).toMatchObject({ ok: true, baseDir: nestedDir });
    } finally {
      process.chdir(cwd);
    }
  });

  it("uses cwd as config lookup directory only when baseDir is omitted", async () => {
    const cwd = process.cwd();
    const baseDir = await createTempDir();
    await writeFile(
      path.join(baseDir, "lsp-mcp.config.jsonc"),
      JSON.stringify({ roots: ["src"] }),
    );

    try {
      process.chdir(baseDir);

      const result = await loadConfig();

      expect(result).toMatchObject({ ok: true, baseDir });
      expect(expectLoaded(result).roots).toEqual(["src"]);
    } finally {
      process.chdir(cwd);
    }
  });
});
