import { readFile } from "node:fs/promises";
import path from "node:path";

import { type ParseError, parse } from "jsonc-parser";

import { type LspMcpConfig, mergeConfigWithDefaults } from "./config.js";
import { lspMcpConfigInputSchema } from "./schema.js";

const CONFIG_FILE_NAME = "lsp-mcp.config.jsonc";

export interface LoadConfigOptions {
  configPath?: string;
  baseDir?: string;
}

export type LoadConfigErrorCode =
  | "config_not_found"
  | "config_parse_error"
  | "config_validation_error"
  | "config_read_error";

export interface LoadConfigError {
  code: LoadConfigErrorCode;
  message: string;
  path: string;
}

export type LoadConfigResult =
  | {
      ok: true;
      config: LspMcpConfig;
      baseDir: string;
      configPath?: string;
    }
  | { ok: false; error: LoadConfigError };

export async function loadConfig(
  options: LoadConfigOptions = {},
): Promise<LoadConfigResult> {
  const lookupBaseDir = path.resolve(options.baseDir ?? process.cwd());
  const explicitConfigPath = options.configPath !== undefined;
  const configPath = explicitConfigPath
    ? path.resolve(lookupBaseDir, options.configPath ?? "")
    : path.join(lookupBaseDir, CONFIG_FILE_NAME);

  let source: string;

  try {
    source = await readFile(configPath, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) {
      if (explicitConfigPath) {
        return {
          ok: false,
          error: {
            code: "config_not_found",
            message: `Config file not found: ${configPath}`,
            path: configPath,
          },
        };
      }

      return {
        ok: true,
        config: mergeConfigWithDefaults(),
        baseDir: lookupBaseDir,
      };
    }

    return {
      ok: false,
      error: {
        code: "config_read_error",
        message: `Unable to read config file: ${configPath}`,
        path: configPath,
      },
    };
  }

  const parseErrors: ParseError[] = [];
  const parsed = parse(source, parseErrors, {
    allowTrailingComma: true,
    disallowComments: false,
  });

  if (parseErrors.length > 0) {
    return {
      ok: false,
      error: {
        code: "config_parse_error",
        message: `Unable to parse config file: ${configPath}`,
        path: configPath,
      },
    };
  }

  const validation = lspMcpConfigInputSchema.safeParse(parsed);

  if (!validation.success) {
    return {
      ok: false,
      error: {
        code: "config_validation_error",
        message: validation.error.message,
        path: configPath,
      },
    };
  }

  return {
    ok: true,
    config: mergeConfigWithDefaults(validation.data),
    baseDir: path.dirname(configPath),
    configPath,
  };
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
