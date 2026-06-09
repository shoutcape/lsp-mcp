import {
  CallHierarchyIncomingCallsRequest,
  CallHierarchyOutgoingCallsRequest,
  CallHierarchyPrepareRequest,
  type CallHierarchyIncomingCall,
  type CallHierarchyItem,
  type CallHierarchyOutgoingCall,
  type Definition,
  DefinitionRequest,
  type Hover,
  HoverRequest,
  type Location,
  type Position,
  PrepareRenameRequest,
  ReferencesRequest,
  RenameRequest,
  type WorkspaceEdit,
} from "vscode-languageserver-protocol";

import type { LspConnection } from "./types.js";

export async function requestDefinition(
  connection: LspConnection,
  uri: string,
  position: Position,
): Promise<Definition | null> {
  return connection.sendRequest(DefinitionRequest.type, {
    textDocument: { uri },
    position,
  }) as Promise<Definition | null>;
}

export async function requestReferences(
  connection: LspConnection,
  uri: string,
  position: Position,
  includeDeclaration = true,
): Promise<Location[] | null> {
  return connection.sendRequest(ReferencesRequest.type, {
    textDocument: { uri },
    position,
    context: { includeDeclaration },
  }) as Promise<Location[] | null>;
}

export async function requestHover(
  connection: LspConnection,
  uri: string,
  position: Position,
): Promise<Hover | null> {
  return connection.sendRequest(HoverRequest.type, {
    textDocument: { uri },
    position,
  }) as Promise<Hover | null>;
}

export async function requestPrepareRename(
  connection: LspConnection,
  uri: string,
  position: Position,
): Promise<unknown> {
  return connection.sendRequest(PrepareRenameRequest.type, {
    textDocument: { uri },
    position,
  });
}

export async function requestRename(
  connection: LspConnection,
  uri: string,
  position: Position,
  newName: string,
): Promise<WorkspaceEdit | null> {
  return connection.sendRequest(RenameRequest.type, {
    textDocument: { uri },
    position,
    newName,
  }) as Promise<WorkspaceEdit | null>;
}

export async function requestPrepareCallHierarchy(
  connection: LspConnection,
  uri: string,
  position: Position,
): Promise<CallHierarchyItem[] | null> {
  return connection.sendRequest(CallHierarchyPrepareRequest.type, {
    textDocument: { uri },
    position,
  }) as Promise<CallHierarchyItem[] | null>;
}

export async function requestCallHierarchyIncoming(
  connection: LspConnection,
  item: CallHierarchyItem,
): Promise<CallHierarchyIncomingCall[] | null> {
  return connection.sendRequest(CallHierarchyIncomingCallsRequest.type, {
    item,
  }) as Promise<CallHierarchyIncomingCall[] | null>;
}

export async function requestCallHierarchyOutgoing(
  connection: LspConnection,
  item: CallHierarchyItem,
): Promise<CallHierarchyOutgoingCall[] | null> {
  return connection.sendRequest(CallHierarchyOutgoingCallsRequest.type, {
    item,
  }) as Promise<CallHierarchyOutgoingCall[] | null>;
}
