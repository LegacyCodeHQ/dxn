import { namingAdvice } from "@next/analysis/suggestions.js";
import { checkFile, type FileProblem } from "@next/check/file.js";
import type { Span } from "@next/model/enumeration.js";
import type { RuleId } from "@next/model/rules.js";
import { isRecord, isType } from "@next/model/type.js";
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
  recordNames: ReadonlySet<string>,
  fieldNames: ReadonlyMap<number, ReadonlySet<string>>,
  valueNames: ReadonlyMap<number, ReadonlySet<string>>,
): Problem {
  if (p.kind === "duplicateName")
    return {
      code: p.kind,
      rule: p.rule,
      message: `[${p.rule}] name '${p.name}' is declared more than once; give each declaration a distinct name`,
      at: p.at,
    };
  if (p.kind === "record") {
    const e = p.problem;
    if (e.kind === "containsItself")
      return {
        code: e.kind,
        rule: e.rule,
        at: e.at,
        message: `[${e.rule}] record '${p.name}' contains itself: ${e.path.join(" -> ")}; remove a field that leads back`,
      };
    const messages = {
      badRecordName:
        "record names must start with an ASCII capital letter and contain only ASCII letters and digits",
      noFields:
        "a record must declare at least one field; use an enumeration field to record yes or no",
      badFieldName:
        "field names must use ASCII lowercase letters and digits, with single hyphens only between them",
      duplicateField: "a field name is declared more than once; rename one of the fields",
      noSuchFieldType:
        "no enumeration or record in this file has this name; declare it or use an existing enumeration or record",
    };
    const taken =
      e.kind === "badRecordName"
        ? declarationNames
        : e.kind === "badFieldName"
          ? fieldNames.get(e.at[0]?.start ?? -1)
          : undefined;
    const advice =
      taken && "name" in e
        ? namingAdvice(
            e.kind === "badRecordName" ? "badEnumName" : "badValueName",
            e.name,
            taken,
            "record",
          )
        : { advice: "" };
    const message =
      e.kind === "noSuchFieldType" && typeNames.has(e.name)
        ? `'${e.name}' is a type; a field's type is an enumeration or a record`
        : `${"name" in e ? `'${e.name}': ` : ""}${messages[e.kind]}${advice.advice}`;
    return {
      code: e.kind,
      rule: e.rule,
      at: e.at,
      message: `[${e.rule}] ${message}`,
      ...(advice.suggestion ? { suggestion: advice.suggestion } : {}),
    };
  }
  if (p.kind === "type") {
    const e = p.problem;
    if (e.kind === "noSuchEnum" && (typeNames.has(e.name) || recordNames.has(e.name))) {
      return {
        code: e.kind,
        rule: e.rule,
        message: `[${e.rule}] '${e.name}' is a ${typeNames.has(e.name) ? "type" : "record"}, not an enumeration; a type varies over enumerations only`,
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
  const recordNames = new Set(parsed.declarations.filter(isRecord).map((d) => d.name.text));
  const fieldNames = new Map<number, ReadonlySet<string>>();
  const valueNames = new Map<number, ReadonlySet<string>>();
  for (const declaration of parsed.declarations) {
    if (isRecord(declaration)) {
      const names = new Set(declaration.fields.map((f) => f.name.text));
      for (const field of declaration.fields) fieldNames.set(field.name.span.start, names);
      continue;
    }
    if (isType(declaration)) continue;
    const names = new Set(declaration.values.map((v) => v.text));
    for (const value of declaration.values) valueNames.set(value.span.start, names);
  }
  const problems: Problem[] = [
    ...parsed.problems.map((p) => ({ code: "syntax-error", message: p.message, at: [p.at] })),
    ...checkFile(parsed.declarations).map((p) =>
      problem(p, declarationNames, typeNames, recordNames, fieldNames, valueNames),
    ),
  ];
  return { declarations: parsed.declarations, problems };
}
