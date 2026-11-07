import { isType } from "@next/model/type.js";
import { parse } from "@next/syntax/parse.js";

/** Canonical declaration syntax; malformed input is left for the author to repair. */
export function format(source: string): string | undefined {
  const file = parse(source);
  if (file.problems.length) return undefined;
  return file.declarations
    .map((d) =>
      isType(d)
        ? `type ${d.name.text} {${d.varies.length ? ` varies ${d.varies.map((n) => n.text).join(", ")} ` : " "}}\n`
        : `enum ${d.name.text} {${d.values.length ? ` ${d.values.map((v) => v.text).join(", ")} ` : " "}}\n`,
    )
    .join("");
}
