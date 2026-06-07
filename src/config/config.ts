export interface TypeScriptLanguageConfig {
  enabled: boolean;
  command: string[];
  extensions: string[];
  projectMarkers: string[];
}

export interface LspMcpConfig {
  roots: string[];
  languages: {
    typescript: TypeScriptLanguageConfig;
  };
  sessions: {
    idleTimeoutMs: number;
    restartOnCrash: boolean;
  };
  output: {
    defaultLimit: number;
  };
}

export const defaultConfig: LspMcpConfig = {
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
};
