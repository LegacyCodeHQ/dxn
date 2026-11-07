import { isEnumName, isValueName } from "@next/check/names.js";
import type { Name, Span } from "@next/model/enumeration.js";
import type { RecordDeclaration, RecordField } from "@next/model/record.js";
import { recordRules } from "@next/model/rules.js";

type Named<K extends "badRecordName" | "badFieldName" | "duplicateField" | "noSuchFieldType"> = {
  kind: K;
  rule: (typeof recordRules)[K];
  name: string;
  at: Span[];
};
export type RecordProblem =
  | Named<"badRecordName">
  | Named<"badFieldName">
  | Named<"duplicateField">
  | Named<"noSuchFieldType">
  | { kind: "noFields"; rule: "R2"; at: Span[] }
  | { kind: "containsItself"; rule: "R6"; at: Span[]; path: string[] };

function occurrences(names: readonly Name[]) {
  const found = new Map<string, Span[]>();
  for (const { text, span } of names) {
    const at = found.get(text);
    if (at) at.push(span);
    else found.set(text, [span]);
  }
  return found;
}

/** R1–R5, each once in written order. R6 is checked against the whole file separately. */
export function checkRecord(
  enums: ReadonlySet<string>,
  records: ReadonlySet<string>,
  r: RecordDeclaration,
): RecordProblem[] {
  const problems: RecordProblem[] = [];
  if (!isEnumName(r.name.text))
    problems.push({
      kind: "badRecordName",
      rule: recordRules.badRecordName,
      name: r.name.text,
      at: [r.name.span],
    });
  if (!r.fields.length)
    problems.push({ kind: "noFields", rule: recordRules.noFields, at: [r.body] });
  const names = occurrences(r.fields.map((f) => f.name));
  for (const [name, at] of names)
    if (!isValueName(name))
      problems.push({ kind: "badFieldName", rule: recordRules.badFieldName, name, at });
  for (const [name, at] of names)
    if (at.length > 1)
      problems.push({ kind: "duplicateField", rule: recordRules.duplicateField, name, at });
  for (const [name, at] of occurrences(r.fields.map((f) => f.type)))
    if (!enums.has(name) && !records.has(name))
      problems.push({ kind: "noSuchFieldType", rule: recordRules.noSuchFieldType, name, at });
  return problems;
}

/** A witness back to a record, following the first declaration of each name as Lean does. */
export function recordCycle(
  records: readonly RecordDeclaration[],
  name: string,
): { at: Span[]; path: string[] } | undefined {
  const first = new Map<string, RecordDeclaration>();
  for (const r of records) if (!first.has(r.name.text)) first.set(r.name.text, r);
  const walk = (
    current: string,
    seen: Set<string>,
    path: string[],
    at: Span[],
  ): { at: Span[]; path: string[] } | undefined => {
    for (const f of first.get(current)?.fields ?? []) {
      const next = f.type.text;
      if (!first.has(next)) continue;
      if (next === name) return { at: [...at, f.type.span], path: [...path, next] };
      if (seen.has(next)) continue;
      seen.add(next);
      const result = walk(next, seen, [...path, next], [...at, f.type.span]);
      if (result) return result;
    }
    return undefined;
  };
  return walk(name, new Set([name]), [name], []);
}

export function frozenRecord(r: RecordDeclaration): RecordDeclaration {
  const span = (s: Span): Span => Object.freeze({ start: s.start, end: s.end });
  const name = (n: Name): Name => Object.freeze({ text: n.text, span: span(n.span) });
  const field = (f: RecordField): RecordField =>
    Object.freeze({ name: name(f.name), type: name(f.type) });
  return Object.freeze({
    kind: "record",
    name: name(r.name),
    fields: Object.freeze(r.fields.map(field)),
    span: span(r.span),
    body: span(r.body),
  });
}
