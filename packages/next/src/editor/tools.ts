import type { Span } from "@next/model/enumeration.js";
import { renameEnum } from "@next/refactor/rename.js";
import { parse } from "@next/syntax/parse.js";

const contains = (span: Span, offset: number) => span.start <= offset && offset < span.end;

/** A declaration under the cursor, including values named after keywords. */
export function symbolAt(source: string, offset: number) {
  for (const d of parse(source).declarations) {
    if (contains(d.name.span, offset))
      return {
        kind: "enum" as const,
        name: d.name.text,
        span: d.name.span,
        signature: `enum ${d.name.text} { ${d.values.map((v) => v.text).join(", ")} }`,
      };
    for (const v of d.values) {
      if (contains(v.span, offset))
        return {
          kind: "value" as const,
          name: v.text,
          span: v.span,
          signature: `${d.name.text}.${v.text}`,
        };
    }
  }
  return undefined;
}

/** Only enumeration rename is specified so far; never silently rename a value. */
export function renameAt(source: string, offset: number, name: string) {
  const symbol = symbolAt(source, offset);
  return symbol?.kind === "enum" ? renameEnum(source, symbol.name, name) : undefined;
}

export function semanticTokens(source: string) {
  return parse(source).declarations.flatMap((d) => [
    { span: d.name.span, kind: "enum" as const },
    ...d.values.map((v) => ({ span: v.span, kind: "enumMember" as const })),
  ]);
}
