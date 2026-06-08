import { describe, expect, it } from "vitest";

import { defaultConfig } from "../../../src/config/config.js";
import { createTypeScriptPreset } from "../../../src/languages/typescript/preset.js";

describe("createTypeScriptPreset", () => {
  it("maps default TypeScript and JavaScript extensions to language ids", () => {
    const preset = createTypeScriptPreset(defaultConfig.languages.typescript);

    expect(preset.languageIdForPath("src/index.ts")).toBe("typescript");
    expect(preset.languageIdForPath("src/index.mts")).toBe("typescript");
    expect(preset.languageIdForPath("src/index.cts")).toBe("typescript");
    expect(preset.languageIdForPath("src/component.tsx")).toBe(
      "typescriptreact",
    );
    expect(preset.languageIdForPath("src/index.js")).toBe("javascript");
    expect(preset.languageIdForPath("src/index.mjs")).toBe("javascript");
    expect(preset.languageIdForPath("src/index.cjs")).toBe("javascript");
    expect(preset.languageIdForPath("src/component.jsx")).toBe(
      "javascriptreact",
    );
  });

  it("honors configured extensions", () => {
    const preset = createTypeScriptPreset({
      ...defaultConfig.languages.typescript,
      extensions: [".ts"],
    });

    expect(preset.isSupportedFile("src/index.ts")).toBe(true);
    expect(preset.isSupportedFile("src/component.tsx")).toBe(false);
    expect(preset.languageIdForPath("src/component.tsx")).toBeUndefined();
  });

  it("returns cloned command and project marker arrays", () => {
    const preset = createTypeScriptPreset(defaultConfig.languages.typescript);

    const command = preset.getCommand();
    const markers = preset.getProjectMarkers();
    command.push("--mutated");
    markers.push("mutated.json");

    expect(preset.getCommand()).toEqual([
      "typescript-language-server",
      "--stdio",
    ]);
    expect(preset.getProjectMarkers()).toEqual([
      "tsconfig.json",
      "package.json",
    ]);
  });
});
