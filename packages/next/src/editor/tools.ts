import type { Span } from "@next/model/enumeration.js";
import { isEnumeration, isType } from "@next/model/type.js";
import { renameEnum } from "@next/refactor/rename.js";
import { parse } from "@next/syntax/parse.js";

const contains = (span: Span, offset: number) => span.start <= offset && offset < span.end;

/** A declaration or reference under the cursor, including names spelled as keywords. */
export function symbolAt(source: string, offset: number) {
  const declarations = parse(source).declarations;
  for (const d of declarations) {
    if (contains(d.name.span, offset))
      return {
        kind: isType(d) ? ("type" as const) : ("enum" as const),
        name: d.name.text,
        span: d.name.span,
        definition: d.name.span,
        signature: isType(d)
          ? `type ${d.name.text} {${d.varies.length ? ` varies ${d.varies.map((n) => n.text).join(", ")} ` : " "}}`
          : `enum ${d.name.text} { ${d.values.map((v) => v.text).join(", ")} }`,
      };
    if (isType(d)) {
      for (const n of d.varies) {
        if (!contains(n.span, offset)) continue;
        const targets = declarations.filter(isEnumeration).filter((e) => e.name.text === n.text);
        const target = targets.length === 1 ? targets[0] : undefined;
        return {
          kind: "enumReference" as const,
          name: n.text,
          span: n.span,
          definition: target?.name.span,
          signature: target
            ? `enum ${target.name.text} { ${target.values.map((v) => v.text).join(", ")} }`
            : n.text,
        };
      }
    } else {
      for (const v of d.values) {
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
  }
  return undefined;
}

/** Enumeration declarations and references support rename; types and values have no specified rename. */
export function renameAt(source: string, offset: number, name: string) {
  const symbol = symbolAt(source, offset);
  return symbol?.kind === "enum" || symbol?.kind === "enumReference"
    ? renameEnum(source, symbol.name, name)
    : undefined;
}

/** Enumeration references plus, optionally, its declaration. Other symbols have only a declaration. */
export function referencesAt(source: string, offset: number, includeDeclaration: boolean): Span[] {
  const symbol = symbolAt(source, offset);
  if (!symbol?.definition) return [];
  if (symbol.kind !== "enum" && symbol.kind !== "enumReference")
    return includeDeclaration ? [symbol.span] : [];
  return parse(source).declarations.flatMap((d) =>
    isType(d)
      ? d.varies.filter((n) => n.text === symbol.name).map((n) => n.span)
      : includeDeclaration && d.name.text === symbol.name
        ? [d.name.span]
        : [],
  );
}

export function semanticTokens(source: string) {
  return parse(source).declarations.flatMap<{
    span: Span;
    kind: "type" | "enum" | "enumMember";
    declaration: boolean;
  }>((d) =>
    isType(d)
      ? [
          { span: d.name.span, kind: "type" as const, declaration: true },
          ...d.varies.map((n) => ({ span: n.span, kind: "enum" as const, declaration: false })),
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
