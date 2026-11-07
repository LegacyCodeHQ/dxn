import type { Span } from "@next/model/enumeration.js";
import { isEnumeration, isRecord, isType } from "@next/model/type.js";
import { renameDecl } from "@next/refactor/rename.js";
import { formatDeclaration } from "@next/syntax/format.js";
import { parse } from "@next/syntax/parse.js";

const contains = (span: Span, offset: number) => span.start <= offset && offset < span.end;

/** A declaration or reference under the cursor, including names spelled as keywords. */
export function symbolAt(source: string, offset: number) {
  const declarations = parse(source).declarations;
  for (const d of declarations) {
    const signature = formatDeclaration;
    if (contains(d.name.span, offset))
      return {
        kind: isType(d) ? ("type" as const) : isRecord(d) ? ("record" as const) : ("enum" as const),
        name: d.name.text,
        span: d.name.span,
        definition: d.name.span,
        signature: signature(d),
      };
    const names = isType(d) ? d.varies : isRecord(d) ? d.fields.map((f) => f.type) : [];
    for (const n of names) {
      if (!contains(n.span, offset)) continue;
      const targets = declarations.filter(
        (e) => (isType(d) ? isEnumeration(e) : !isType(e)) && e.name.text === n.text,
      );
      const target = targets.length === 1 ? targets[0] : undefined;
      return {
        kind:
          target && isRecord(target) ? ("recordReference" as const) : ("enumReference" as const),
        name: n.text,
        span: n.span,
        definition: target?.name.span,
        signature: target ? signature(target) : n.text,
      };
    }
    if (isRecord(d)) {
      for (const f of d.fields)
        if (contains(f.name.span, offset))
          return {
            kind: "field" as const,
            name: f.name.text,
            span: f.name.span,
            definition: f.name.span,
            signature: `${d.name.text}.${f.name.text}: ${f.type.text}`,
          };
    } else if (isEnumeration(d)) {
      for (const v of d.values)
        if (contains(v.span, offset))
          return {
            kind: "value" as const,
            name: v.text,
            span: v.span,
            definition: v.span,
            signature: `${d.name.text}.${v.text}`,
          };
    }
  }
  return undefined;
}

/** Declarations and their references support rename; fields and enum values do not. */
export function renameAt(source: string, offset: number, name: string) {
  const symbol = symbolAt(source, offset);
  return symbol &&
    ["enum", "enumReference", "type", "record", "recordReference"].includes(symbol.kind)
    ? renameDecl(source, symbol.name, name)
    : undefined;
}

/** Declaration references plus, optionally, the declaration itself. Fields and values are local. */
export function referencesAt(source: string, offset: number, includeDeclaration: boolean): Span[] {
  const symbol = symbolAt(source, offset);
  if (!symbol?.definition) return [];
  if (!["enum", "enumReference", "record", "recordReference"].includes(symbol.kind))
    return includeDeclaration ? [symbol.span] : [];
  return parse(source).declarations.flatMap((d) =>
    isType(d)
      ? d.varies.filter((n) => n.text === symbol.name).map((n) => n.span)
      : isRecord(d)
        ? [
            ...(includeDeclaration && d.name.text === symbol.name ? [d.name.span] : []),
            ...d.fields.filter((f) => f.type.text === symbol.name).map((f) => f.type.span),
          ]
        : includeDeclaration && d.name.text === symbol.name
          ? [d.name.span]
          : [],
  );
}

export function semanticTokens(source: string) {
  const declarations = parse(source).declarations;
  const enums = new Set(declarations.filter(isEnumeration).map((d) => d.name.text));
  return declarations.flatMap<{
    span: Span;
    kind: "type" | "enum" | "enumMember" | "property" | "struct";
    declaration: boolean;
  }>((d) =>
    isType(d)
      ? [
          { span: d.name.span, kind: "type" as const, declaration: true },
          ...d.varies.map((n) => ({ span: n.span, kind: "enum" as const, declaration: false })),
        ]
      : isRecord(d)
        ? [
            { span: d.name.span, kind: "struct", declaration: true },
            ...d.fields.flatMap((f) => [
              { span: f.name.span, kind: "property" as const, declaration: true },
              {
                span: f.type.span,
                kind: (enums.has(f.type.text) ? "enum" : "struct") as "enum" | "struct",
                declaration: false,
              },
            ]),
          ]
        : [
            { span: d.name.span, kind: "enum" as const, declaration: true },
            ...d.values.map((v) => ({
              span: v.span,
              kind: "enumMember" as const,
              declaration: true,
            })),
          ],
  );
}
