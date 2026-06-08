import path from "node:path";

import type { TypeScriptLanguageConfig } from "../../config/config.js";

export interface TypeScriptPreset {
  languageIdForPath(filePath: string): string | undefined;
  isSupportedFile(filePath: string): boolean;
  getCommand(): string[];
  getProjectMarkers(): string[];
}

const defaultLanguageIds = new Map<string, string>([
  [".ts", "typescript"],
  [".mts", "typescript"],
  [".cts", "typescript"],
  [".tsx", "typescriptreact"],
  [".js", "javascript"],
  [".mjs", "javascript"],
  [".cjs", "javascript"],
  [".jsx", "javascriptreact"],
]);

export function createTypeScriptPreset(
  config: TypeScriptLanguageConfig,
): TypeScriptPreset {
  const extensions = new Set(config.extensions);
  const command = [...config.command];
  const projectMarkers = [...config.projectMarkers];
  const languageIdForPath = (filePath: string): string | undefined => {
    const extension = path.extname(filePath);

    if (!extensions.has(extension)) {
      return undefined;
    }

    return defaultLanguageIds.get(extension);
  };

  return {
    languageIdForPath,
    isSupportedFile(filePath) {
      return languageIdForPath(filePath) !== undefined;
    },
    getCommand() {
      return [...command];
    },
    getProjectMarkers() {
      return [...projectMarkers];
    },
  };
}
