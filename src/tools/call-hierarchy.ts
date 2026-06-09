import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  CallHierarchyItemInfo,
  CallHierarchyRequest,
  CallHierarchyResult,
  SemanticProvider,
} from "../providers/semantic-provider.js";
import { textResult } from "./text-result.js";

function formatItem(item: CallHierarchyItemInfo): string {
  const container = item.containerName ? ` (in ${item.containerName})` : "";
  return `${item.name}${container} [${item.kind}] at ${item.file}:${item.line}`;
}

export function formatCallHierarchyResult(
  request: CallHierarchyRequest,
  result: CallHierarchyResult,
): string {
  if (result.item === null) {
    return `No call hierarchy item at ${request.file}:${request.line}:${request.column}`;
  }

  const lines = [`Call hierarchy for: ${formatItem(result.item)}\n`];

  if (request.direction === "incoming" || request.direction === "both") {
    const incoming = result.incoming ?? [];
    lines.push(`  Incoming calls (${incoming.length}):`);
    if (incoming.length === 0) {
      lines.push("    (none)");
    } else {
      for (const call of incoming) {
        lines.push(`    <- ${formatItem(call.from)}`);
      }
    }
    lines.push("");
  }

  if (request.direction === "outgoing" || request.direction === "both") {
    const outgoing = result.outgoing ?? [];
    lines.push(`  Outgoing calls (${outgoing.length}):`);
    if (outgoing.length === 0) {
      lines.push("    (none)");
    } else {
      for (const call of outgoing) {
        lines.push(`    -> ${formatItem(call.to)}`);
      }
    }
  }

  return lines.join("\n");
}

export function createCallHierarchyTool(provider: SemanticProvider) {
  return async function callHierarchy(
    input: CallHierarchyRequest,
  ): Promise<CallToolResult> {
    const result = await provider.getCallHierarchy(input);
    return textResult(formatCallHierarchyResult(input, result));
  };
}
