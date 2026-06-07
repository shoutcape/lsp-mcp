export interface WorkspaceRoot {
  name?: string;
  path: string;
}

export type WorkspaceRootInput = string | WorkspaceRoot;

export function normalizeWorkspaceRoots(
  roots: WorkspaceRootInput[],
): WorkspaceRoot[] {
  return roots.map((root) => {
    if (typeof root === "string") {
      return { path: root };
    }

    return root;
  });
}
