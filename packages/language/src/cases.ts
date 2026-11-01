import type { ParseResult } from "./ast.js";
import { holds } from "./condition.js";
import { placement, states } from "./evaluate.js";
import { type Combination, expand } from "./status.js";

// What a type, or a child in place, has that can be told apart: each case,
// by the values that tell it apart, with the combinations it covers.
export interface Cases {
  name: string;
  // What can tell its combinations apart: the dimensions its type needs and
  // its states, in order.
  subjects: string[];
  combinations: number;
  cases: { values: Record<string, string>; combinations: Combination[] }[];
}

// The cases of a type, by its name, or of a child in place, by its path. Its
// combinations are told apart only by its own states and by the dimensions
// its type needs, less what it declares alike, unless alike is set aside;
// what only the types around it depend on is alike. The file must have no
// problems.
export function cases(
  file: ParseResult,
  target: string,
  { alike = true }: { alike?: boolean } = {},
): Cases {
  const placed = target.split(".").some((segment) => /^[a-z]/.test(segment));
  const type = placed
    ? placement(file, target).target
    : file.types.find(({ name }) => name === target);
  if (type === undefined) throw new Error(`no type ${target}`);
  const combinations: Combination[] = placed
    ? expand(file, target, [])
    : states(file, type.name).rows.flatMap((row) => {
        let expanded: Record<string, string>[] = [{}];
        for (const [name, values] of Object.entries(row.states)) {
          expanded = expanded.flatMap((each) =>
            values.map((value) => ({ ...each, [name]: value })),
          );
        }
        return expanded.map((own) => ({
          ...(row.profiles === undefined ? {} : { profiles: row.profiles }),
          dimensions: row.when,
          parents: {},
          states: own,
        }));
      });
  const valuesOf = (name: string) =>
    [...file.enums, ...file.dimensions]
      .find((declaration) => declaration.name === name)
      ?.values.map(({ name: value }) => value) ?? [];
  // A value as it tells combinations apart: alone, as one of values alike,
  // or not at all, when all its values are alike.
  const told = (subject: string, value: string, combination: Combination) => {
    for (const { subject: on, values, when } of alike ? type.alikes : []) {
      if (on.name !== subject) continue;
      const at = (name: string) => combination.states[name] ?? combination.dimensions[name];
      if (when !== undefined && !holds(when, at)) continue;
      if (values === undefined) return undefined;
      const alike = values.map(({ name }) => name);
      if (!alike.includes(value)) continue;
      const of = /^[a-z]/.test(subject)
        ? type.states.find(({ name }) => name === subject)?.enum.name
        : subject;
      return valuesOf(of ?? "")
        .filter((each) => alike.includes(each))
        .join(", ");
    }
    return value;
  };
  const found: Cases["cases"] = [];
  for (const combination of combinations) {
    const values: Record<string, string> = {};
    for (const { name } of type.needs) {
      const value = combination.dimensions[name];
      const shown = value === undefined ? undefined : told(name, value, combination);
      if (shown !== undefined) values[name] = shown;
    }
    for (const { name } of type.states) {
      const value = combination.states[name];
      const shown = value === undefined ? undefined : told(name, value, combination);
      if (shown !== undefined) values[name] = shown;
    }
    const key = JSON.stringify(values);
    const same = found.find((each) => JSON.stringify(each.values) === key);
    if (same !== undefined) same.combinations.push(combination);
    else found.push({ values, combinations: [combination] });
  }
  return {
    name: target,
    subjects: [...type.needs, ...type.states].map(({ name }) => name),
    combinations: combinations.length,
    cases: found,
  };
}
