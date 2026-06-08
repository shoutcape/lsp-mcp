import { createHash } from "node:crypto";
import { readFile as fsReadFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  DidChangeTextDocumentNotification,
  DidOpenTextDocumentNotification,
} from "vscode-languageserver-protocol";

import type { LspConnection } from "./types.js";

export type ReadFileFn = (filePath: string) => Promise<string>;

interface TrackedDocument {
  version: number;
  contentHash: string;
}

export class DocumentSync {
  private readonly connection: LspConnection;
  private readonly readFile: ReadFileFn;
  private readonly documents = new Map<string, TrackedDocument>();

  constructor(connection: LspConnection, readFile?: ReadFileFn) {
    this.connection = connection;
    this.readFile = readFile ?? ((p) => fsReadFile(p, "utf8"));
  }

  async prepareFile(filePath: string, languageId: string): Promise<void> {
    const content = await this.readFile(filePath);
    const contentHash = hashContent(content);
    const uri = pathToFileURL(filePath).toString();
    const existing = this.documents.get(filePath);

    if (existing === undefined) {
      const version = 1;
      this.documents.set(filePath, { version, contentHash });
      await this.connection.sendNotification(
        DidOpenTextDocumentNotification.type,
        { textDocument: { uri, languageId, version, text: content } },
      );
      return;
    }

    if (existing.contentHash === contentHash) {
      return;
    }

    const version = existing.version + 1;
    this.documents.set(filePath, { version, contentHash });
    await this.connection.sendNotification(
      DidChangeTextDocumentNotification.type,
      {
        textDocument: { uri, version },
        contentChanges: [{ text: content }],
      },
    );
  }
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
