import { type Declaration, isRecord, isType } from "@next/model/type.js";
import { parse } from "@next/syntax/parse.js";

/** The same written declaration for formatter and editor signatures. */
export function formatDeclaration(d: Declaration): string {
  if (isType(d))
    return `type ${d.name.text} {${d.varies.length ? ` varies ${d.varies.map((n) => n.text).join(", ")} ` : " "}}`;
  if (isRecord(d)) {
    if (!d.fields.length) return `record ${d.name.text} { }`;
    const fields = d.fields.map((f) => `${f.name.text}: ${f.type.text}`);
    return fields.length === 1
      ? `record ${d.name.text} { ${fields[0]} }`
      : `record ${d.name.text} {\n${fields.map((f) => `  ${f}`).join("\n")}\n}`;
  }
  return `enum ${d.name.text} {${d.values.length ? ` ${d.values.map((v) => v.text).join(", ")} ` : " "}}`;
}

/** Canonical declaration syntax; malformed input is left for the author to repair. */
export function format(source: string): string | undefined {
  const file = parse(source);
  if (file.problems.length) return undefined;
  return file.declarations.map((d) => `${formatDeclaration(d)}\n`).join("");
}
