# Slice 9 Return Enrichment & Honest Boundaries Design

Date: 2026-06-11
Status: approved for planning

## Purpose

Slice 9 closes the gap between what LSP tools can actually tell an agent and
what agents assume they can tell. Slice 8 added `kind` tags to references, but
several real failure modes are still invisible to the agent:

- Spread-site prop flows (`{...props}`, `<Modal {...props}>`) are tagged
  `reference` even though the trail terminates there for per-prop tracking.
- A degraded or `any`-typed boundary looks identical to a normal empty result.
- Cross-tsconfig references silently vanish.
- Tool descriptions imply completeness for string-keyed usages (test-ids, i18n
  keys, GraphQL names, env vars, CSS class -> DOM relationships) that LSP cannot
  index at all.

After this slice:
- `spread` and `jsx-attribute` kind tags let agents spot trail-termination
  sites immediately from the reference list, without re-reading files.
- A `caveats:` block at the bottom of the output surfaces reliability
  conditions - degraded server, `any`-typed symbol, spread presence,
  cross-project boundary - as explicit stated gaps, not silent omissions.
- Tool descriptions in `server.ts` include honest "Does NOT cover" clauses
  so agents self-route to grep/ast-grep/browser for the gaps that are
  inherently outside LSP's reach.

## Scope

Build:

- Two new `ReferenceKind` values: `spread` and `jsx-attribute`.
- `classifyReferences` classifier rules for both new kinds.
- `caveats?: string[]` field on `ReferencesResult` and `CallHierarchyResult`.
- Caveat population in `LspSemanticProvider.getReferences`:
  - degraded TS server state.
  - `any`-typed query symbol (via parallel hover request).
  - spread refs present.
  - cross-tsconfig project boundary.
  - truncated output.
- Caveat population in `LspSemanticProvider.getCallHierarchy`:
  - empty result hint (indirect/framework-invoked calls not captured).
- Plain-text caveats rendering at end of both tool outputs.
- Honest "Does NOT cover" clause additions to `find_references` and
  `call_hierarchy` tool descriptions, and a `hover` note on spreads.
- Spec and plan docs.

Do not build:

- Per-prop spread tracking or any form of dataflow analysis.
- AST-based CSS/DOM analysis.
- string-key cross-reference search.
- `symbol_report` combined tool (deferred, Slice 10).
- Session restart or idle eviction.
- Any write-back or file editing.

## Architecture

```
find_references(file, line, column, verbose?)
  -> LspSemanticProvider.getReferences(request)
       -> ensureSession(file)
       -> prepareFile(file)
       -> Promise.all([
            requestReferences(connection, uri, position),
            requestDefinition(connection, uri, position),
            requestHover(connection, uri, position),   // NEW
          ])
       -> classify refs per file (existing, + spread + jsx-attribute kinds)
       -> accumulate caveats:
            degraded?         -> caveat
            hover == "any"?   -> caveat
            any spread refs?  -> caveat with count
            cross-project?    -> caveat
       -> return ReferencesResult { references, caveats }
  -> formatReferencesResult(location, result, { verbose, limit })
       -> existing compact/verbose block (unchanged)
       -> if caveats: append "\n  caveats:\n  - <each>\n"
```

```
call_hierarchy(file, line, column, direction)
  -> LspSemanticProvider.getCallHierarchy(request)   [existing]
       -> if no item found: return early (existing)
       -> if incoming or outgoing empty: add indirect-call caveat
       -> return CallHierarchyResult { item, incoming, outgoing, caveats }
  -> formatCallHierarchyResult(...)                  [existing formatter]
       -> if caveats: append caveats block
```

### Caveat population rules

| Condition | Caveat text |
|---|---|
| `info.state === "degraded"` | `TS server degraded; results may be incomplete.` |
| hover type resolves to `any` | `Query symbol is \`any\`-typed; reference tracking is unreliable past this boundary.` |
| N refs have kind `spread` | `N refs flow through {...props} spreads; per-prop trail (e.g. className -> DOM) is not followed by LSP.` |
| referenced file under different tsconfig root | `Results span separate TS projects; cross-project refs may be missing.` |
| results truncated | `Showing N of M references; raise output.defaultLimit or use verbose:true for the rest.` |
| call hierarchy result empty | `call_hierarchy only sees direct call expressions; indirect calls (dynamic import, string registries, HOC-wrapped, JSX-prop callbacks) are not captured - use grep/ast-grep.` |

Caveats are additive: all applicable conditions emit; none suppress another.

### `any`-typed detection

The hover request is added to the existing `Promise.all` at
`lsp-semantic-provider.ts:234`. Failure of the hover (null result, network
error, timeout) is silently swallowed - missing the caveat is acceptable;
throwing is not.

Detection heuristic: hover content contains the substring `: any` as a
standalone token (e.g. `(parameter) props: any`, `const x: any`). Exact
match on `any` in the type position; not triggered by `any[]`, `AnyFoo`,
or `maybe`.

### `jsx-attribute` classification

A ref is `jsx-attribute` when:
- It is not in an import/export span.
- The character at `column - 2` is NOT `<` (not a JSX tag name).
- The line context contains an `=` after the ref token with no intervening
  `(` or `;`, OR the ref token immediately precedes `=`.
- The ref is inside an open JSX tag context: scanning backward from the ref
  line, there is an unmatched `<` that is not part of a comparison or
  generics (heuristic: `<UpperCase` on the same or preceding line).

This is a conservative heuristic. Ambiguous cases fall through to
`reference`. No ref is lost.

### `spread` classification

A ref is `spread` when the three characters immediately before the ref token
(trimming intra-line whitespace) are `...`. Catches:

```tsx
const { x, ...rest } = props;   // rest -> spread
<Modal {...props} />             // props -> spread
doSomething(...args)             // args -> spread
```

This is applied before the `call` check (higher priority) since a spread
inside a call (`fn(...x)`) is better described as `spread` than `call`.

## Updated Types

### `src/providers/semantic-provider.ts`

```ts
export type ReferenceKind =
  | "definition"
  | "import"
  | "type-import"
  | "export"
  | "jsx"
  | "jsx-attribute"   // NEW
  | "call"
  | "spread"          // NEW
  | "reference";

export interface ReferencesResult {
  references: ReferenceEntry[];
  caveats?: string[];  // NEW
}

export interface CallHierarchyResult {
  item: CallHierarchyItemInfo | null;
  incoming?: IncomingCallInfo[];
  outgoing?: OutgoingCallInfo[];
  caveats?: string[];  // NEW
}
```

The duplicate `ReferenceKind` in
`src/languages/typescript/reference-classifier.ts` is kept in sync. A test
asserts both are identical.

## Tool Output

### Compact with caveats

```
References for symbol at /src/CustomizedSDSModal.tsx:8:22

  3 files, 11 references
  /src/CustomizedSDSModal.tsx: 3 (1 def, 1 spread, 1 import)
  /src/EditListModal.tsx:      6 (4 jsx-attribute, 2 jsx)
  /src/index.ts:               2 (1 export, 1 import)

  caveats:
  - 1 ref flows through {...props} spreads; per-prop trail (e.g. className -> DOM) is not followed by LSP.
  - Results span separate TS projects; cross-project refs may be missing.
```

### Verbose with caveats

```
References (11 total) for symbol at /src/CustomizedSDSModal.tsx:8:22

  /src/CustomizedSDSModal.tsx:
    L8:22   [definition]
    L14:5   [spread]
    L1:10   [import]
  /src/EditListModal.tsx:
    L3:10   [import]
    L22:7   [jsx]
    ...

  caveats:
  - 1 ref flows through {...props} spreads; per-prop trail (e.g. className -> DOM) is not followed by LSP.
```

### Call hierarchy with empty hint

```
Call hierarchy for symbol at /src/DeliveryModal.tsx:5:14

  No callers found.

  caveats:
  - call_hierarchy only sees direct call expressions; indirect calls (dynamic import, string registries, HOC-wrapped, JSX-prop callbacks) are not captured - use grep/ast-grep.
```

## Tool Description Updates

### `find_references`

Append to existing description:

> "Does NOT find string-keyed usages (data-test-id / getByTestId values, i18n
> translation keys, GraphQL operation and fragment names, env var names,
> Contentful field IDs) or CSS class -> DOM relationships - use grep/ast-grep
> or browser devtools for those. Results depend on a healthy, type-checking TS
> project; any-typed boundaries and cross-tsconfig boundaries can sever the
> chain (surfaced as caveats in the output)."

### `call_hierarchy`

Append to existing description:

> "Does NOT capture indirect or framework-invoked calls: dynamic import,
> string-keyed registries, HOC-wrapped components, or JSX-prop event
> callbacks - use grep/ast-grep for those."

### `hover`

Append to existing description:

> "When a reference trail hits a spread site ({...props}), use hover on
> the spread expression to resolve the element type and continue the trail
> manually."

## Testing

All new logic written test-first.

### `tests/languages/typescript/reference-classifier.test.ts` (additions)

- `{...props}` at the position of `props` -> `spread`
- `<Modal {...props} />` at position of `props` -> `spread`
- `doSomething(...args)` at position of `args` -> `spread`
- `<Foo className={styles.foo}>` at position of `styles` -> `jsx-attribute`
- `<Foo onChange={handler}>` at position of `handler` -> `jsx-attribute`
- Tag name `<Foo` at `Foo` position -> still `jsx` (not reclassified)
- Regression: all existing kind tests unchanged.
- Sync check: `ReferenceKind` in classifier == `ReferenceKind` in
  `semantic-provider.ts`.

### `tests/providers/lsp-semantic-provider.test.ts` (additions)

- degraded session state -> `caveats` contains degraded message; refs
  returned (not thrown).
- hover returns `any` type -> `caveats` contains any-typed message.
- hover fails (null) -> no any-typed caveat, no throw.
- spread ref classified -> `caveats` contains spread count message.
- cross-project fixture -> `caveats` contains cross-project message.
- call hierarchy empty incoming -> `caveats` contains indirect-call message.

### `tests/tools/references.test.ts` (additions)

- caveats block rendered when `caveats` non-empty (compact mode).
- caveats block rendered when `caveats` non-empty (verbose mode).
- no caveats block when `caveats` absent or empty.
- truncation promoted to caveats block.

### `tests/tools/call-hierarchy.test.ts` (additions)

- caveats block rendered for call hierarchy result.

### `tests/server.test.ts` (additions)

- `find_references` description contains "Does NOT find string-keyed".
- `call_hierarchy` description contains "Does NOT capture indirect".
- `hover` description contains "spread site".

Integration tests:

- `tests/integration/semantic-tools.test.ts`: no regressions; run existing
  suite after changes.

## Risks

- **Conservative jsx-attribute heuristic** - ambiguous cases fall through to
  `reference`; no ref lost.
- **Extra hover round-trip** - parallelized in `Promise.all`, swallowed on
  failure; no latency regression in the common case.
- **Caveat noise** - caveats only emitted when conditions are true (except
  call_hierarchy empty hint which is always-on when result is empty). All
  caveats are factual, not speculative.
- **Classifier sync** - `ReferenceKind` defined twice (classifier file and
  provider file). Test asserts equality. A follow-up slice can consolidate.

## Acceptance

```sh
pnpm test
pnpm check
pnpm build
```

## Self-Review

- Placeholder scan: no placeholders.
- Scope check: no write-back, no session management, no new tools beyond
  description updates.
- Ambiguity check: all new kinds have conservative fallback to `reference`.
  Caveat conditions documented precisely.
- Consistency check: plain-text output follows slice-8 convention; caveats
  block is indented at same level as file list.
