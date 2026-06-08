import type {
  Diagnostic,
  PublishDiagnosticsParams,
} from "vscode-languageserver-protocol";

const DEFAULT_WAIT_MS = 3_000;

interface Waiter {
  uri: string;
  afterRevision: number | undefined;
  resolve: (diagnostics: Diagnostic[]) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class DiagnosticsStore {
  private readonly store = new Map<string, Diagnostic[]>();
  private readonly revisions = new Map<string, number>();
  private readonly waiters: Waiter[] = [];

  onDiagnostics(params: PublishDiagnosticsParams): void {
    this.store.set(params.uri, [...params.diagnostics]);
    const revision = this.getRevision(params.uri) + 1;
    this.revisions.set(params.uri, revision);

    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const waiter = this.waiters[i];
      if (
        waiter !== undefined &&
        waiter.uri === params.uri &&
        (waiter.afterRevision === undefined || revision > waiter.afterRevision)
      ) {
        clearTimeout(waiter.timeout);
        waiter.resolve([...params.diagnostics]);
        this.waiters.splice(i, 1);
      }
    }
  }

  getDiagnostics(uri: string): Diagnostic[] {
    return [...(this.store.get(uri) ?? [])];
  }

  getRevision(uri: string): number {
    return this.revisions.get(uri) ?? 0;
  }

  waitForDiagnostics(
    uri: string,
    timeoutMs = DEFAULT_WAIT_MS,
  ): Promise<Diagnostic[]> {
    const existing = this.store.get(uri);
    if (existing !== undefined) {
      return Promise.resolve([...existing]);
    }

    return new Promise((resolve) => {
      const waiter: Waiter = {
        uri,
        afterRevision: undefined,
        resolve,
        timeout: setTimeout(() => {
          const idx = this.waiters.indexOf(waiter);
          if (idx !== -1) this.waiters.splice(idx, 1);
          resolve([]);
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  waitForDiagnosticsAfter(
    uri: string,
    revision: number,
    timeoutMs = DEFAULT_WAIT_MS,
  ): Promise<Diagnostic[]> {
    if (this.getRevision(uri) > revision) {
      return Promise.resolve(this.getDiagnostics(uri));
    }

    return new Promise((resolve) => {
      const waiter: Waiter = {
        uri,
        afterRevision: revision,
        resolve,
        timeout: setTimeout(() => {
          const idx = this.waiters.indexOf(waiter);
          if (idx !== -1) this.waiters.splice(idx, 1);
          resolve([]);
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  clear(): void {
    this.store.clear();
    this.revisions.clear();
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timeout);
      waiter.resolve([]);
    }
    this.waiters.length = 0;
  }
}
