import path from "node:path";

import type { WorkspaceRoot } from "./roots.js";

export interface ResolveWorkspaceRootsOptions {
  roots: string[];
  baseDir: string;
}

export interface WorkspaceRootResolutionError {
  code: "no_workspace_roots";
  message: string;
}

export type ResolveWorkspaceRootsResult =
  | { ok: true; roots: WorkspaceRoot[] }
  | { ok: false; error: WorkspaceRootResolutionError };

export function resolveWorkspaceRoots(
  options: ResolveWorkspaceRootsOptions,
): ResolveWorkspaceRootsResult {
  const baseDir = path.resolve(options.baseDir);

  return {
    ok: true,
    roots: options.roots.map((root) => ({
      path: path.isAbsolute(root)
        ? path.normalize(root)
        : path.resolve(baseDir, root),
    })),
  };
}
