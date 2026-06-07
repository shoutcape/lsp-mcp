import { describe, expect, it } from "vitest";

import { defaultConfig } from "../../src/config/config.js";

describe("defaultConfig", () => {
  it("uses approved foundation defaults", () => {
    expect(defaultConfig).toEqual({
      roots: [],
      languages: {
        typescript: {
          enabled: true,
          command: ["typescript-language-server", "--stdio"],
          extensions: [
            ".ts",
            ".tsx",
            ".js",
            ".jsx",
            ".mjs",
            ".cjs",
            ".mts",
            ".cts",
          ],
          projectMarkers: ["tsconfig.json", "package.json"],
        },
      },
      sessions: {
        idleTimeoutMs: 900000,
        restartOnCrash: true,
      },
      output: {
        defaultLimit: 50,
      },
    });
  });
});
