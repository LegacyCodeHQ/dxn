import { isEnumName } from "@next/check/names.js";
import type { Name, Span } from "@next/model/enumeration.js";
import { typeRules } from "@next/model/rules.js";
import type { TypeDeclaration } from "@next/model/type.js";

type Ruled<K extends keyof typeof typeRules> = {
  kind: K;
  rule: (typeof typeRules)[K];
  name: string;
  at: Span[];
};
export type TypeProblem = Ruled<"badTypeName"> | Ruled<"noSuchEnum"> | Ruled<"duplicateVaries">;

/** T1, then each missing enumeration, then each repeated enumeration, in written order. */
export function checkType(enums: ReadonlySet<string>, declaration: TypeDeclaration): TypeProblem[] {
  const problems: TypeProblem[] = [];
  if (!isEnumName(declaration.name.text)) {
    problems.push({
      kind: "badTypeName",
      rule: typeRules.badTypeName,
      name: declaration.name.text,
      at: [declaration.name.span],
    });
  }
  const written = new Map<string, Span[]>();
  for (const { text, span } of declaration.varies) {
    const at = written.get(text);
    if (at) at.push(span);
    else written.set(text, [span]);
  }
  for (const [name, at] of written) {
    if (!enums.has(name))
      problems.push({ kind: "noSuchEnum", rule: typeRules.noSuchEnum, name, at });
  }
  for (const [name, at] of written) {
    if (at.length > 1)
      problems.push({ kind: "duplicateVaries", rule: typeRules.duplicateVaries, name, at });
  }
  return problems;
}

/** Retain an immutable copy of exactly what was checked. */
export function frozenType(d: TypeDeclaration): TypeDeclaration {
  const span = (at: Span): Span => Object.freeze({ start: at.start, end: at.end });
  const name = (n: Name): Name => Object.freeze({ text: n.text, span: span(n.span) });
  return Object.freeze({
    kind: "type",
    name: name(d.name),
    varies: Object.freeze(d.varies.map(name)),
    span: span(d.span),
  });
}
