import { parse } from "@next/syntax/parse.js";

/** Canonical enum syntax; malformed input is left for the author to repair. */
export function format(source: string): string | undefined {
  const file = parse(source);
  if (file.problems.length) return undefined;
  return file.declarations
    .map(
      (d) =>
        `enum ${d.name.text} {${d.values.length ? ` ${d.values.map((v) => v.text).join(", ")} ` : " "}}\n`,
    )
    .join("");
}
