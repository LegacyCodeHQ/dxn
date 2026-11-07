import { namingAdvice } from "@next/analysis/suggestions.js";
import { checkFile, type FileProblem } from "@next/check/file.js";
import type { Span } from "@next/model/enumeration.js";
import type { RuleId } from "@next/model/rules.js";
import { isType } from "@next/model/type.js";
import { parse } from "@next/syntax/parse.js";

export type { RuleId } from "@next/model/rules.js";

export interface Problem {
  rule?: RuleId;
  suggestion?: string;
  code: string;
  message: string;
  at: readonly Span[];
}

function problem(
  p: FileProblem,
  declarationNames: ReadonlySet<string>,
  typeNames: ReadonlySet<string>,
  valueNames: ReadonlyMap<number, ReadonlySet<string>>,
): Problem {
  if (p.kind === "duplicateName")
    return {
      code: p.kind,
      rule: p.rule,
      message: `[${p.rule}] name '${p.name}' is declared more than once; give each declaration a distinct name`,
      at: p.at,
    };
  if (p.kind === "type") {
    const e = p.problem;
    if (e.kind === "noSuchEnum" && typeNames.has(e.name)) {
      return {
        code: e.kind,
        rule: e.rule,
        message: `[${e.rule}] '${e.name}' is a type, not an enumeration; a type varies over enumerations only`,
        at: e.at,
      };
    }
    const messages = {
      badTypeName:
        "type names must start with an ASCII capital letter and contain only ASCII letters and digits",
      noSuchEnum:
        "no enumeration in this file has this name; use an existing enumeration or declare it",
      duplicateVaries: "an enumeration is listed more than once; remove the repeated reference",
    };
    const advice =
      e.kind === "badTypeName"
        ? namingAdvice("badEnumName", e.name, declarationNames)
        : { advice: "" };
    return {
      code: e.kind,
      rule: e.rule,
      message: `[${e.rule}] '${e.name}': ${messages[e.kind]}${advice.advice}`,
      at: e.at,
      ...(advice.suggestion ? { suggestion: advice.suggestion } : {}),
    };
  }
  const e = p.problem;
  const messages = {
    badEnumName:
      "enumeration names must start with an ASCII capital letter and contain only ASCII letters and digits",
    badValueName:
      "value names must use ASCII lowercase letters and digits, with single hyphens only between them",
    empty: "an enumeration must declare at least one value",
    duplicate: "a value is declared more than once; remove the repeated declaration",
  };
  const rule = e.rule;
  const taken = e.kind === "badEnumName" ? declarationNames : valueNames.get(e.at[0]?.start ?? -1);
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
  const declarationNames = new Set(parsed.declarations.map((d) => d.name.text));
  const typeNames = new Set(parsed.declarations.filter(isType).map((d) => d.name.text));
  const valueNames = new Map<number, ReadonlySet<string>>();
  for (const declaration of parsed.declarations) {
    if (isType(declaration)) continue;
    const names = new Set(declaration.values.map((v) => v.text));
    for (const value of declaration.values) valueNames.set(value.span.start, names);
  }
  const problems: Problem[] = [
    ...parsed.problems.map((p) => ({ code: "syntax-error", message: p.message, at: [p.at] })),
    ...checkFile(parsed.declarations).map((p) =>
      problem(p, declarationNames, typeNames, valueNames),
    ),
  ];
  return { declarations: parsed.declarations, problems };
}
