import { namingAdvice } from "@next/analysis/suggestions.js";
import { checkFile, type FileProblem } from "@next/check/file.js";
import type { Span } from "@next/model/enumeration.js";
import { parse } from "@next/syntax/parse.js";

/** Stable IDs of the language rules in notebook/reference. Syntax errors have no checker rule. */
export type RuleId = "E1" | "E2" | "E3" | "E4" | "F1";

export interface Problem {
  rule?: RuleId;
  suggestion?: string;
  code: string;
  message: string;
  at: readonly Span[];
}

function problem(
  p: FileProblem,
  enumNames: ReadonlySet<string>,
  valueNames: ReadonlyMap<number, ReadonlySet<string>>,
): Problem {
  if (p.kind === "duplicateEnum")
    return {
      code: p.kind,
      rule: "F1",
      message: `[F1] enumeration '${p.name}' is declared more than once; give each enumeration a distinct name`,
      at: p.at,
    };
  const e = p.problem;
  const messages = {
    badEnumName:
      "enumeration names must start with an ASCII capital letter and contain only ASCII letters and digits",
    badValueName:
      "value names must use ASCII lowercase letters and digits, with single hyphens only between them",
    empty: "an enumeration must declare at least one value",
    duplicate: "a value is declared more than once; remove the repeated declaration",
  };
  const rule = ({ badEnumName: "E1", empty: "E2", badValueName: "E3", duplicate: "E4" } as const)[
    e.kind
  ];
  const taken = e.kind === "badEnumName" ? enumNames : valueNames.get(e.at[0]?.start ?? -1);
  const advice =
    taken && (e.kind === "badEnumName" || e.kind === "badValueName")
      ? namingAdvice(e.kind, e.name, taken)
      : { advice: "" };
  return {
    ...(advice.suggestion ? { suggestion: advice.suggestion } : {}),
    code: e.kind,
    rule,
    message: `[${rule}] ${"name" in e ? `'${e.name}': ` : ""}${messages[e.kind]}${advice.advice}`,
    at: e.at,
  };
}

/** One diagnostic contract for command-line and editor consumers. */
export function analyze(source: string) {
  const parsed = parse(source);
  const enumNames = new Set(parsed.declarations.map((d) => d.name.text));
  const valueNames = new Map<number, ReadonlySet<string>>();
  for (const declaration of parsed.declarations) {
    const names = new Set(declaration.values.map((v) => v.text));
    for (const value of declaration.values) valueNames.set(value.span.start, names);
  }
  const problems: Problem[] = [
    ...parsed.problems.map((p) => ({ code: "syntax-error", message: p.message, at: [p.at] })),
    ...checkFile(parsed.declarations).map((p) => problem(p, enumNames, valueNames)),
  ];
  return { declarations: parsed.declarations, problems };
}
