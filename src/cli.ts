#!/usr/bin/env node
import { startStdioServer } from "./server.js";

try {
  await startStdioServer();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`lsp-mcp failed to start: ${message}\n`);
  process.exitCode = 1;
}
