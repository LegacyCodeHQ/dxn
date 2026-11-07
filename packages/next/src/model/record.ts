import type { Name, Span, Value } from "@next/model/enumeration.js";

export interface RecordField {
  readonly name: Name;
  readonly type: Name;
}

/** A record declaration, including its braces for the empty-record diagnostic. */
export interface RecordDeclaration {
  readonly kind: "record";
  readonly name: Name;
  readonly fields: readonly RecordField[];
  readonly body: Span;
  readonly span: Span;
}

/** Named products hold nested field values; enumeration identity is retained at the leaves. */
export type FieldValue =
  | { kind: "enum"; value: Value }
  | { kind: "record"; fields: Readonly<Record<string, FieldValue>> };

export function fieldValue(value: FieldValue, name: string): FieldValue | undefined {
  return value.kind === "record" && Object.hasOwn(value.fields, name)
    ? value.fields[name]
    : undefined;
}

/** Compare fields by name, independent of insertion order, down to tagged enum values. */
export function equalFieldValues(a: FieldValue, b: FieldValue): boolean {
  if (a.kind === "enum")
    return b.kind === "enum" && a.value.enum === b.value.enum && a.value.name === b.value.name;
  if (b.kind !== "record") return false;
  const names = Object.keys(a.fields);
  return (
    names.length === Object.keys(b.fields).length &&
    names.every((name) => {
      const av = fieldValue(a, name),
        bv = fieldValue(b, name);
      return av !== undefined && bv !== undefined && equalFieldValues(av, bv);
    })
  );
}
