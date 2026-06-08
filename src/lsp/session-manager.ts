import type { TypeScriptPreset } from "../languages/typescript/preset.js";
import {
  routeTypeScriptProject,
  type TypeScriptProjectRouteResult,
} from "../languages/typescript/project-routing.js";
import type { WorkspaceRoot } from "../workspace/roots.js";
import { LspSession } from "./session.js";
import type { LspSessionInfo } from "./types.js";

export type { LspSessionInfo } from "./types.js";

export interface LspSessionLike {
  initialize(): Promise<LspSessionInfo>;
}

export interface LspSessionManagerSummary {
  state: LspSessionInfo["state"];
  message: string;
  serverCapabilities: string[];
}

export interface LspSessionManagerOptions {
  command: string[];
  roots: WorkspaceRoot[];
  preset: TypeScriptPreset;
  routeProject?: (options: {
    requestedPath: string;
    roots: WorkspaceRoot[];
    preset: TypeScriptPreset;
  }) => Promise<TypeScriptProjectRouteResult>;
  sessionFactory?: (options: {
    command: string[];
    projectAnchor: string;
    rootPath: string;
  }) => LspSessionLike;
}

export class LspSessionManager {
  private readonly command: string[];
  private readonly roots: WorkspaceRoot[];
  private readonly preset: TypeScriptPreset;
  private readonly routeProject: NonNullable<
    LspSessionManagerOptions["routeProject"]
  >;
  private readonly sessionFactory: NonNullable<
    LspSessionManagerOptions["sessionFactory"]
  >;
  private readonly sessionsByProjectAnchor = new Map<string, LspSessionLike>();
  private lastInfo: LspSessionInfo | undefined;

  constructor(options: LspSessionManagerOptions) {
    this.command = [...options.command];
    this.roots = options.roots.map((root) => ({ ...root }));
    this.preset = options.preset;
    this.routeProject = options.routeProject ?? routeTypeScriptProject;
    this.sessionFactory =
      options.sessionFactory ??
      ((sessionOptions) => new LspSession(sessionOptions));
  }

  getSummary(): LspSessionManagerSummary {
    if (this.lastInfo === undefined) {
      return {
        state: "not_started",
        message: "TypeScript LSP sessions are not started.",
        serverCapabilities: [],
      };
    }

    return {
      state: this.lastInfo.state,
      message: this.lastInfo.message,
      serverCapabilities: [...this.lastInfo.serverCapabilities],
    };
  }

  async ensureSession(requestedPath: string): Promise<LspSessionInfo> {
    const route = await this.routeProject({
      requestedPath,
      roots: this.roots,
      preset: this.preset,
    });

    if (!route.ok) {
      this.lastInfo = {
        state: "failed",
        message: route.error.message,
        projectAnchor: "",
        rootPath: "",
        serverCapabilities: [],
      };

      return cloneInfo(this.lastInfo);
    }

    let session = this.sessionsByProjectAnchor.get(route.projectAnchor);

    if (session === undefined) {
      session = this.sessionFactory({
        command: [...this.command],
        projectAnchor: route.projectAnchor,
        rootPath: route.root.path,
      });
      this.sessionsByProjectAnchor.set(route.projectAnchor, session);
    }

    this.lastInfo = cloneInfo(await session.initialize());

    return cloneInfo(this.lastInfo);
  }
}

function cloneInfo(info: LspSessionInfo): LspSessionInfo {
  const cloned: LspSessionInfo = {
    ...info,
    serverCapabilities: [...info.serverCapabilities],
  };

  if (info.rawServerCapabilities !== undefined) {
    cloned.rawServerCapabilities = structuredClone(info.rawServerCapabilities);
  }

  return cloned;
}
