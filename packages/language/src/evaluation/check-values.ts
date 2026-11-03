import type { Branch, Diagnostic, Located } from "../core/ast.js";
import { message, words } from "../core/message.js";
import type { Names } from "../model/names.js";

// Where a check reports a problem, an error or a warning: its code, its
// message and where it is.
type Reported = (code: string, message: string, at: { line: number; column: number }) => void;
export interface Report {
  error: Reported;
  warn: Reported;
}

// A report that adds each problem to a list of diagnostics.
export function reportTo(diagnostics: Diagnostic[]): Report {
  const into =
    (severity: Diagnostic["severity"]): Reported =>
    (code, message, at) =>
      diagnostics.push({ severity, code, message, line: at.line, column: at.column });
  return { error: into("error"), warn: into("warning") };
}

// Values chosen from a dimension, or from a state's enum: each one of its
// values, and once.
export function checkChosen(
  chosen: Located[],
  dimension: string,
  names: Names,
  { error }: Report,
  where: string,
  // What the values are of, in messages: a state's name, for its enum's values.
  of = dimension,
): void {
  const allowed = names.values(dimension);
  if (allowed === undefined) return;
  const seen = new Set<string>();
  for (const item of chosen) {
    if (!allowed.includes(item.name)) {
      error("unknown-value", message`${item.name} is not a value of ${of} (${allowed})`, item);
    } else if (seen.has(item.name)) {
      error("duplicate-value", message`${item.name} appears twice in ${words(where)}`, item);
    }
    seen.add(item.name);
  }
}
// A when's branches: each value of its subject covered once, each giving a
// value of its result. A side whose values are not known, such as a broken
// enum's, which may not all have been read, is not checked against them.
export function checkWhen(
  branches: Branch[],
  on: Located,
  subject: { name: string; values: string[] | undefined },
  result: { name: string; values: string[] | undefined },
  { error, warn }: Report,
): void {
  const allowed = subject.values;
  if (allowed !== undefined) {
    const covered = new Set<string>();
    for (const value of branches.flatMap(({ values }) => values)) {
      if (!allowed.includes(value.name)) {
        error(
          "unknown-value",
          message`${value.name} is not a value of ${subject.name} (${allowed})`,
          value,
        );
      } else if (covered.has(value.name)) {
        error("duplicate-value", message`${value.name} is already covered by the when`, value);
      }
      covered.add(value.name);
    }
    const missing = allowed.filter((value) => !covered.has(value));
    const otherwise = branches.find((branch) => branch.otherwise !== undefined)?.otherwise;
    if (otherwise !== undefined && missing.length === 0) {
      warn(
        "unused-else",
        message`${"else"} covers nothing: the other branches cover every value of ${subject.name}`,
        otherwise,
      );
    } else if (otherwise === undefined && missing.length > 0) {
      error("incomplete-when", message`${`when ${subject.name}`} does not cover ${missing}`, on);
    }
  }
  const results = result.values;
  if (results === undefined) return;
  for (const branch of branches) {
    if (!results.includes(branch.result.name)) {
      error(
        "unknown-value",
        message`${branch.result.name} is not a value of ${result.name} (${results})`,
        branch.result,
      );
    }
  }
}
