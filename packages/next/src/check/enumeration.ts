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
function occurrences(names: readonly Name[]): Map<string, Span[]> {
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

/** A copy of a declaration that nothing can change, so what was checked stays as it was. */
function frozen(declaration: EnumDeclaration): EnumDeclaration {
  const span = ({ start, end }: Span): Span => Object.freeze({ start, end });
  const name = ({ text, span: at }: Name): Name => Object.freeze({ text, span: span(at) });
  return Object.freeze({
    name: name(declaration.name),
    values: Object.freeze(declaration.values.map(name)),
    span: span(declaration.span),
  });
}

/**
 * A declaration the checker accepted, as Lean's `Enum` is a declaration with a proof that it is
 * valid. Only `acceptEnum` makes one: the constructor is private, and the private member keeps a
 * look-alike object from passing as one. It keeps a frozen copy of what it checked, so neither
 * the caller's declaration nor its own can change it into one that is not valid.
 */
export class Enum {
  declare private readonly accepted: true;

  private constructor(readonly declaration: EnumDeclaration) {}

  /** Check a declaration: an enumeration when it has no problems, else its problems. */
  static accept(declaration: EnumDeclaration): Accepted {
    const copy = frozen(declaration);
    const problems = checkEnum(copy);
    return problems.length === 0
      ? { enum: new Enum(copy), problems: [] }
      : { enum: undefined, problems };
  }

  /** Its values, in written order, each tagged with the enumeration's name. */
  get values(): Value[] {
    const { name, values } = this.declaration;
    return values.map(({ text }) => ({ enum: name.text, name: text }));
  }
}

/** What checking a declaration gives: an enumeration, or the problems that stop it being one. */
export type Accepted = { enum: Enum; problems: [] } | { enum: undefined; problems: EnumProblem[] };

/** Check a declaration: an enumeration when it has no problems, else its problems. */
export function acceptEnum(declaration: EnumDeclaration): Accepted {
  return Enum.accept(declaration);
}
