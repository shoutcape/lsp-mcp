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

export type DeepPartial<T> = {
  [Key in keyof T]?: T[Key] extends unknown[]
    ? T[Key]
    : T[Key] extends object
      ? DeepPartial<T[Key]>
      : T[Key];
};

export type LspMcpConfigInput = DeepPartial<LspMcpConfig>;

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

export function mergeConfigWithDefaults(
  input: LspMcpConfigInput = {},
): LspMcpConfig {
  const typescript = input.languages?.typescript;

  return {
    roots: cloneStringArray(input.roots ?? defaultConfig.roots),
    languages: {
      typescript: {
        enabled:
          typescript?.enabled ?? defaultConfig.languages.typescript.enabled,
        command: cloneStringArray(
          typescript?.command ?? defaultConfig.languages.typescript.command,
        ),
        extensions: cloneStringArray(
          typescript?.extensions ??
            defaultConfig.languages.typescript.extensions,
        ),
        projectMarkers: cloneStringArray(
          typescript?.projectMarkers ??
            defaultConfig.languages.typescript.projectMarkers,
        ),
      },
    },
    sessions: {
      idleTimeoutMs:
        input.sessions?.idleTimeoutMs ?? defaultConfig.sessions.idleTimeoutMs,
      restartOnCrash:
        input.sessions?.restartOnCrash ?? defaultConfig.sessions.restartOnCrash,
    },
    output: {
      defaultLimit:
        input.output?.defaultLimit ?? defaultConfig.output.defaultLimit,
    },
  };
}

function cloneStringArray(values: string[]): string[] {
  return [...values];
}
