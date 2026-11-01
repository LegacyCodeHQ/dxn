import type { Branch, Located } from "./ast.js";
import type { Names } from "./names.js";

// Where a check reports a problem: its code, its message, where it is, and
// whether it is an error or a warning.
export type Report = (
  code: string,
  message: string,
  at: { line: number; column: number },
  severity?: "error" | "warning",
) => void;

// Values chosen from a dimension, or from a state's enum: each one of its
// values, and once.
export function checkChosen(
  chosen: Located[],
  dimension: string,
  names: Names,
  report: Report,
  where: string,
  // What the values are of, in messages: a state's name, for its enum's values.
  of = dimension,
): void {
  const allowed = names.values(dimension);
  if (allowed === undefined) return;
  const seen = new Set<string>();
  for (const item of chosen) {
    if (!allowed.includes(item.name)) {
      report(
        "unknown-value",
        `${JSON.stringify(item.name)} is not a value of ${of} (${allowed.join(", ")})`,
        item,
      );
    } else if (seen.has(item.name)) {
      report("duplicate-value", `${JSON.stringify(item.name)} appears twice in ${where}`, item);
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
  report: Report,
): void {
  const allowed = subject.values;
  if (allowed !== undefined) {
    const covered = new Set<string>();
    for (const value of branches.flatMap(({ values }) => values)) {
      if (!allowed.includes(value.name)) {
        report(
          "unknown-value",
          `${JSON.stringify(value.name)} is not a value of ${subject.name} (${allowed.join(", ")})`,
          value,
        );
      } else if (covered.has(value.name)) {
        report(
          "duplicate-value",
          `${JSON.stringify(value.name)} is already covered by the when`,
          value,
        );
      }
      covered.add(value.name);
    }
    const missing = allowed.filter((value) => !covered.has(value));
    const otherwise = branches.find((branch) => branch.otherwise !== undefined)?.otherwise;
    if (otherwise !== undefined && missing.length === 0) {
      report(
        "unused-else",
        `else covers nothing: the other branches cover every value of ${subject.name}`,
        otherwise,
        "warning",
      );
    } else if (otherwise === undefined && missing.length > 0) {
      report("incomplete-when", `when ${subject.name} does not cover ${missing.join(", ")}`, on);
    }
  }
  const results = result.values;
  if (results === undefined) return;
  for (const branch of branches) {
    if (!results.includes(branch.result.name)) {
      report(
        "unknown-value",
        `${JSON.stringify(branch.result.name)} is not a value of ${result.name} (${results.join(", ")})`,
        branch.result,
      );
    }
  }
}
