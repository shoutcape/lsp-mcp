import { stat } from "node:fs/promises";
import path from "node:path";

import { resolveSafePath } from "../../safety/path-safety.js";
import type { WorkspaceRoot } from "../../workspace/roots.js";
import type { TypeScriptPreset } from "./preset.js";

export type TypeScriptProjectRouteErrorCode =
  | "no_workspace_roots"
  | "empty_path"
  | "path_outside_workspace"
  | "unsupported_file_type"
  | "project_route_error";

export interface RouteTypeScriptProjectOptions {
  requestedPath: string;
  roots: WorkspaceRoot[];
  preset: TypeScriptPreset;
}

export interface TypeScriptProjectRouteError {
  code: TypeScriptProjectRouteErrorCode;
  message: string;
}

export type TypeScriptProjectRouteResult =
  | {
      ok: true;
      path: string;
      root: WorkspaceRoot;
      projectAnchor: string;
      languageId: string;
    }
  | { ok: false; error: TypeScriptProjectRouteError };

export async function routeTypeScriptProject(
  options: RouteTypeScriptProjectOptions,
): Promise<TypeScriptProjectRouteResult> {
  if (options.roots.length === 0) {
    // No configured roots -- skip path safety, infer project from file
    const filePath = path.resolve(options.requestedPath);

    const languageId = options.preset.languageIdForPath(filePath);
    if (languageId === undefined) {
      return {
        ok: false,
        error: {
          code: "unsupported_file_type",
          message: `Unsupported TypeScript file extension: ${options.requestedPath}`,
        },
      };
    }

    try {
      const inferredRoot = await findProjectRoot(
        path.dirname(filePath),
        options.preset.getProjectMarkers(),
      );
      return {
        ok: true,
        path: filePath,
        root: { path: inferredRoot },
        projectAnchor: inferredRoot,
        languageId,
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "project_route_error",
          message: `Failed to infer project root: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  }

  // Configured roots -- enforce path safety (existing behavior)
  const safePath = resolveSafePath({
    requestedPath: options.requestedPath,
    roots: options.roots,
  });

  if (!safePath.ok) {
    return safePath;
  }

  const languageId = options.preset.languageIdForPath(safePath.path);

  if (languageId === undefined) {
    return {
      ok: false,
      error: {
        code: "unsupported_file_type",
        message: `Unsupported TypeScript file extension: ${options.requestedPath}`,
      },
    };
  }

  try {
    return {
      ok: true,
      path: safePath.path,
      root: safePath.root,
      projectAnchor: await findProjectAnchor(
        path.dirname(safePath.path),
        path.normalize(safePath.root.path),
        options.preset.getProjectMarkers(),
      ),
      languageId,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "project_route_error",
        message: `Failed to route TypeScript project: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

async function findProjectRoot(
  startDirectory: string,
  markers: string[],
): Promise<string> {
  let directory = startDirectory;
  while (true) {
    for (const marker of markers) {
      if (await isFile(path.join(directory, marker))) {
        return directory;
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) break; // filesystem root reached
    directory = parent;
  }
  return startDirectory; // fallback: file's own directory
}

async function findProjectAnchor(
  startDirectory: string,
  rootPath: string,
  markers: string[],
): Promise<string> {
  for (const marker of markers) {
    let directory = startDirectory;

    while (true) {
      const candidatePath = path.resolve(directory, marker);

      if (
        isPathInsideOrEqual(candidatePath, rootPath) &&
        (await isFile(candidatePath))
      ) {
        return directory;
      }

      if (directory === rootPath) {
        break;
      }

      directory = path.dirname(directory);
    }
  }

  return rootPath;
}

function isPathInsideOrEqual(candidatePath: string, rootPath: string): boolean {
  const relativePath = path.relative(rootPath, path.normalize(candidatePath));

  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
