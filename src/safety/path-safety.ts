import path from "node:path";

import type { WorkspaceRoot } from "../workspace/roots.js";

export interface ResolveSafePathOptions {
  requestedPath: string;
  roots: WorkspaceRoot[];
}

export type PathSafetyErrorCode =
  | "empty_path"
  | "no_workspace_roots"
  | "path_outside_workspace";

export interface PathSafetyError {
  code: PathSafetyErrorCode;
  message: string;
}

export type ResolveSafePathResult =
  | { ok: true; path: string; root: WorkspaceRoot }
  | { ok: false; error: PathSafetyError };

export function resolveSafePath(
  options: ResolveSafePathOptions,
): ResolveSafePathResult {
  if (options.requestedPath.trim() === "") {
    return {
      ok: false,
      error: { code: "empty_path", message: "Requested path is empty." },
    };
  }

  if (options.roots.length === 0) {
    return {
      ok: false,
      error: {
        code: "no_workspace_roots",
        message: "No workspace roots configured.",
      },
    };
  }

  for (const root of options.roots) {
    if (!path.isAbsolute(root.path)) {
      continue;
    }

    const rootPath = path.normalize(root.path);
    const candidatePath = path.isAbsolute(options.requestedPath)
      ? path.normalize(options.requestedPath)
      : path.resolve(rootPath, options.requestedPath);

    if (isPathInsideRoot(candidatePath, rootPath)) {
      return { ok: true, path: candidatePath, root };
    }
  }

  return {
    ok: false,
    error: {
      code: "path_outside_workspace",
      message: "Requested path is outside configured workspace roots.",
    },
  };
}

function isPathInsideRoot(candidatePath: string, rootPath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);

  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}
