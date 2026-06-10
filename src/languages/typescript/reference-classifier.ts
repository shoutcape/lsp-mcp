export type ReferenceKind =
  | "definition"
  | "import"
  | "type-import"
  | "export"
  | "jsx"
  | "call"
  | "reference";

export interface ClassifyInput {
  lines: string[];
  refs: Array<{ line: number; column: number }>; // 1-based
  definitionLine?: number; // 1-based; if set, matching ref is tagged "definition"
  definitionColumn?: number; // 1-based
}

interface Span {
  startLine: number; // 1-based inclusive
  endLine: number; // 1-based inclusive
  kind: "import" | "type-import" | "export";
}

export function classifyReferences(input: ClassifyInput): ReferenceKind[] {
  const spans = extractSpans(input.lines);
  return input.refs.map((ref) => classifyOne(ref, spans, input));
}

// Strip a leading generic type parameter `<...>` handling nested generics.
// Returns the input unchanged if it doesn't start with `<` or has an unclosed generic.
function stripLeadingGeneric(s: string): string {
  if (s[0] !== "<") return s;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "<") depth++;
    else if (s[i] === ">") {
      depth--;
      if (depth === 0) return s.slice(i + 1);
    }
  }
  return s; // unclosed generic - don't strip
}

function classifyOne(
  ref: { line: number; column: number },
  spans: Span[],
  input: ClassifyInput,
): ReferenceKind {
  // 1. Definition check (highest priority)
  if (
    input.definitionLine !== undefined &&
    input.definitionColumn !== undefined &&
    ref.line === input.definitionLine &&
    ref.column === input.definitionColumn
  ) {
    return "definition";
  }

  // 2. Span check (import / type-import / export)
  for (const span of spans) {
    if (ref.line >= span.startLine && ref.line <= span.endLine) {
      // Check for inline `type` keyword before the ref name within import spans
      if (span.kind === "import") {
        const lineText = input.lines[ref.line - 1] ?? "";
        // Strip the partial identifier at ref position, then check for `type` keyword
        const before = lineText
          .slice(0, ref.column - 1)
          .replace(/[A-Za-z_$][\w$]*$/, "");
        if (/\btype\s+$/.test(before)) {
          return "type-import";
        }
      }
      return span.kind;
    }
  }

  // 3. JSX: character immediately before the ref on the same line is "<"
  const lineText = input.lines[ref.line - 1] ?? "";
  const charBefore = lineText[ref.column - 2]; // column is 1-based, so -2 for preceding char
  if (charBefore === "<") {
    return "jsx";
  }

  // 4. Call: after the ref token, the next non-whitespace/generic char is "("
  const afterRef = lineText.slice(ref.column - 1);
  const afterIdentifier = afterRef.replace(/^[A-Za-z_$][\w$]*/, "");
  const afterGeneric = stripLeadingGeneric(afterIdentifier);
  if (afterGeneric.trimStart().startsWith("(")) {
    return "call";
  }

  return "reference";
}

// Scan lines for import/export statement spans using brace counting.
function extractSpans(lines: string[]): Span[] {
  const spans: Span[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trimStart();

    // Match import or export statement start
    const importMatch = /^import\s+(type\s+)?/.exec(trimmed);
    const exportMatch = !importMatch && /^export\s+(type\s+)?\{/.exec(trimmed);

    if (importMatch || exportMatch) {
      const isTypeImport = importMatch !== null && importMatch[1] !== undefined;
      const spanKind: Span["kind"] = exportMatch
        ? "export"
        : isTypeImport
          ? "type-import"
          : "import";

      const startLine = i + 1; // 1-based
      let endLine = startLine;

      // Walk forward until the statement ends (semicolon or closing brace at top level)
      let braceDepth = 0;
      for (let j = i; j < lines.length; j++) {
        const l = lines[j] ?? "";
        for (const ch of l) {
          if (ch === "{") braceDepth++;
          else if (ch === "}") braceDepth--;
        }
        if (l.includes(";") && braceDepth <= 0) {
          endLine = j + 1; // 1-based
          i = j; // outer loop will increment past this line
          break;
        }
        if (j === i && !l.includes("{") && !l.includes(";")) {
          // single-line import without braces (e.g. `import foo from "bar"`)
          endLine = j + 1;
          break;
        }
      }

      spans.push({ startLine, endLine, kind: spanKind });
    }

    i++;
  }

  return spans;
}
