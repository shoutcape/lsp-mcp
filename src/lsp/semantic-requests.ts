import {
  type Definition,
  DefinitionRequest,
  type Hover,
  HoverRequest,
  type Location,
  type Position,
  ReferencesRequest,
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
