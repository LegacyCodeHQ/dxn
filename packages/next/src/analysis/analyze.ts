import { checkFile, type FileProblem } from "@next/check/file.js";
import type { Span } from "@next/model/enumeration.js";
import { parse } from "@next/syntax/parse.js";

/** Stable IDs of the language rules in notebook/reference. Syntax errors have no checker rule. */
export type RuleId = "E1" | "E2" | "E3" | "E4" | "F1";

export interface Problem {
  rule?: RuleId;
  code: string;
  message: string;
  at: readonly Span[];
}

function problem(p: FileProblem): Problem {
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
  return {
    code: e.kind,
    rule,
    message: `[${rule}] ${"name" in e ? `'${e.name}': ` : ""}${messages[e.kind]}`,
    at: e.at,
  };
}

/** One diagnostic contract for command-line and editor consumers. */
export function analyze(source: string) {
  const parsed = parse(source);
  const problems: Problem[] = [
    ...parsed.problems.map((p) => ({ code: "syntax-error", message: p.message, at: [p.at] })),
    ...checkFile(parsed.declarations).map(problem),
  ];
  return { declarations: parsed.declarations, problems };
}
