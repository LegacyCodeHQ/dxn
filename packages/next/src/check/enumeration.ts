import type { EnumDeclaration, Name, Span, Value } from "@next/model/enumeration.js";
import { isEnumName, isValueName } from "./names.js";

// The checker of lean/Dxn/Enumeration.lean. It reports the same problems, for
// the same names, in the same order; it adds where each one is written.

/** A problem with an enumeration declaration, and every place it is written. */
export type EnumProblem =
  | { kind: "badEnumName"; name: string; at: Span[] }
  | { kind: "empty"; at: Span[] }
  | { kind: "badValueName"; name: string; at: Span[] }
  | { kind: "duplicate"; name: string; at: Span[] };

/** Each name, once, in the order it is first written, with every place it is written. */
function occurrences(names: Name[]): Map<string, Span[]> {
  const found = new Map<string, Span[]>();
  for (const { text, span } of names) {
    const spans = found.get(text);
    if (spans) spans.push(span);
    else found.set(text, [span]);
  }
  return found;
}

/**
 * Every problem with a declaration, each once. No problems means it is accepted. A bad
 * enumeration name comes first, then no values, then bad value names, then names written twice,
 * each in the order it is first written.
 */
export function checkEnum(declaration: EnumDeclaration): EnumProblem[] {
  const problems: EnumProblem[] = [];
  const { name, values } = declaration;
  if (!isEnumName(name.text)) {
    problems.push({ kind: "badEnumName", name: name.text, at: [name.span] });
  }
  if (values.length === 0) problems.push({ kind: "empty", at: [declaration.span] });
  const written = occurrences(values);
  for (const [text, at] of written) {
    if (!isValueName(text)) problems.push({ kind: "badValueName", name: text, at });
  }
  for (const [text, at] of written) {
    if (at.length > 1) problems.push({ kind: "duplicate", name: text, at });
  }
  return problems;
}

/** The values of a declaration, in written order, each tagged with the enumeration's name. */
export function enumValues(declaration: EnumDeclaration): Value[] {
  return declaration.values.map(({ text }) => ({ enum: declaration.name.text, name: text }));
}
