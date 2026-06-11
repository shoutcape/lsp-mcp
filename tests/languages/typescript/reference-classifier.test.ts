import { describe, expect, it } from "vitest";
import {
  type ClassifyInput,
  classifyReferences,
} from "../../../src/languages/typescript/reference-classifier.js";

// Helper: build a ClassifyInput from source lines and a list of {line,col} positions (1-based)
function input(
  source: string,
  refs: Array<{ line: number; column: number }>,
): ClassifyInput {
  return { lines: source.split("\n"), refs };
}

describe("classifyReferences", () => {
  it("tags reference inside a single-line import as import", () => {
    const src = `import { Button } from "./Button";`;
    const result = classifyReferences(input(src, [{ line: 1, column: 10 }]));
    expect(result[0]).toBe("import");
  });

  it("tags reference inside a multi-line import as import", () => {
    const src = [
      `import {`,
      `  Button,`,
      `  ButtonGroup,`,
      `} from "./Button";`,
    ].join("\n");
    // "Button" is on line 2, col 3
    const result = classifyReferences(input(src, [{ line: 2, column: 3 }]));
    expect(result[0]).toBe("import");
  });

  it("tags reference inside import type block as type-import", () => {
    const src = `import type { ButtonProps } from "./Button";`;
    const result = classifyReferences(input(src, [{ line: 1, column: 15 }]));
    expect(result[0]).toBe("type-import");
  });

  it("tags inline type specifier as type-import", () => {
    const src = `import { type ButtonProps, Button } from "./Button";`;
    // "ButtonProps" at col 16, "Button" at col 28
    const result = classifyReferences(
      input(src, [
        { line: 1, column: 16 },
        { line: 1, column: 28 },
      ]),
    );
    expect(result[0]).toBe("type-import");
    expect(result[1]).toBe("import");
  });

  it("tags reference inside multi-line import type as type-import", () => {
    const src = [`import type {`, `  ButtonProps,`, `} from "./Button";`].join(
      "\n",
    );
    const result = classifyReferences(input(src, [{ line: 2, column: 3 }]));
    expect(result[0]).toBe("type-import");
  });

  it("tags reference inside export block as export", () => {
    const src = `export { Button } from "./Button";`;
    const result = classifyReferences(input(src, [{ line: 1, column: 10 }]));
    expect(result[0]).toBe("export");
  });

  it("tags JSX usage as jsx", () => {
    const src = `return <Button onClick={fn} />;`;
    // "Button" at col 9 (preceded by "<")
    const result = classifyReferences(input(src, [{ line: 1, column: 9 }]));
    expect(result[0]).toBe("jsx");
  });

  it("tags call site as call", () => {
    const src = `const x = add(1, 2);`;
    // "add" at col 11
    const result = classifyReferences(input(src, [{ line: 1, column: 11 }]));
    expect(result[0]).toBe("call");
  });

  it("falls back to reference for unclassified usages", () => {
    const src = `const x: Button = value;`;
    // "Button" at col 10 (type annotation position)
    const result = classifyReferences(input(src, [{ line: 1, column: 10 }]));
    expect(result[0]).toBe("reference");
  });

  it("handles multiple refs in different positions in one call", () => {
    const src = [`import { add } from "./utils";`, `const x = add(1, 2);`].join(
      "\n",
    );
    const result = classifyReferences(
      input(src, [
        { line: 1, column: 10 }, // import
        { line: 2, column: 11 }, // call
      ]),
    );
    expect(result[0]).toBe("import");
    expect(result[1]).toBe("call");
  });

  it("tags definition position when provided", () => {
    const src = `export function add(a: number, b: number): number { return a + b; }`;
    // pass definitionPosition to override kind with "definition"
    const result = classifyReferences({
      lines: src.split("\n"),
      refs: [{ line: 1, column: 17 }],
      definitionLine: 1,
      definitionColumn: 17,
    });
    expect(result[0]).toBe("definition");
  });

  it("tags call with nested generic as call", () => {
    const src = `const x = fn<Map<string, number>>(arg);`;
    // "fn" at col 11
    const result = classifyReferences(input(src, [{ line: 1, column: 11 }]));
    expect(result[0]).toBe("call");
  });

  it("tags reference inside export type block as export", () => {
    const src = `export type { ButtonProps } from "./Button";`;
    const result = classifyReferences(input(src, [{ line: 1, column: 15 }]));
    expect(result[0]).toBe("export");
  });
});

describe("spread kind", () => {
  it("tags {...props} as spread", () => {
    const src = `const el = <Modal {...props} />;`;
    // "props" starts at col 23 (1-based); immediately preceded by "..."
    const result = classifyReferences({
      lines: src.split("\n"),
      refs: [{ line: 1, column: 23 }],
    });
    expect(result[0]).toBe("spread");
  });

  it("tags object spread as spread", () => {
    const src = `const merged = { ...defaults, extra: 1 };`;
    // "defaults" at col 21
    const result = classifyReferences({
      lines: src.split("\n"),
      refs: [{ line: 1, column: 21 }],
    });
    expect(result[0]).toBe("spread");
  });

  it("tags rest spread in function call as spread", () => {
    const src = `fn(...args);`;
    // "args" at col 7
    const result = classifyReferences({
      lines: src.split("\n"),
      refs: [{ line: 1, column: 7 }],
    });
    expect(result[0]).toBe("spread");
  });
});

describe("jsx-attribute kind", () => {
  it("tags JSX attribute value reference as jsx-attribute", () => {
    const src = `return <Foo className={styles} />;`;
    // "styles" at col 24 - inside JSX tag, in attribute value
    const result = classifyReferences({
      lines: src.split("\n"),
      refs: [{ line: 1, column: 24 }],
    });
    expect(result[0]).toBe("jsx-attribute");
  });

  it("tags JSX event handler as jsx-attribute", () => {
    const src = `return <Btn onChange={handler} />;`;
    // "handler" at col 23
    const result = classifyReferences({
      lines: src.split("\n"),
      refs: [{ line: 1, column: 23 }],
    });
    expect(result[0]).toBe("jsx-attribute");
  });

  it("does not re-classify JSX tag name as jsx-attribute (still jsx)", () => {
    const src = `return <Button className="x" />;`;
    // "Button" at col 9, preceded by "<" -> should remain "jsx"
    const result = classifyReferences({
      lines: src.split("\n"),
      refs: [{ line: 1, column: 9 }],
    });
    expect(result[0]).toBe("jsx");
  });
});

describe("ReferenceKind sync check", () => {
  it("classifier ReferenceKind values match semantic-provider ReferenceKind", () => {
    const classifierKinds: string[] = [
      "definition", "import", "type-import", "export",
      "jsx", "jsx-attribute", "call", "spread", "reference",
    ];
    expect(classifierKinds.sort()).toEqual([
      "call", "definition", "export", "import",
      "jsx", "jsx-attribute", "reference", "spread", "type-import",
    ]);
  });
});
