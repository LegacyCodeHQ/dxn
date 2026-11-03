import type { ResolvedResult } from "@language/core/ast.js";
import { message } from "@language/core/message.js";
import { placement } from "@language/evaluation/evaluate.js";
import { alone, type Combination, expand } from "@language/evaluation/status.js";
import { holds } from "@language/model/condition.js";
import { enumOf, valuesOf } from "@language/model/names.js";

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
  file: ResolvedResult,
  target: string,
  { alike = true }: { alike?: boolean } = {},
): Cases {
  const placed = target.split(".").some((segment) => /^[a-z]/.test(segment));
  const type = placed
    ? placement(file, target).target
    : file.types.find(({ name }) => name === target);
  if (type === undefined) throw new Error(message`no type ${target}`);
  const each: Combination[] = placed ? expand(file, target, []) : alone(file, type.name);
  // Combinations that differ only in their profiles are one, with all of
  // their profiles: profiles differ in dimensions this one does not have.
  const combinations: Combination[] = [];
  const byRest = new Map<string, Combination>();
  for (const combination of each) {
    const { profiles, ...rest } = combination;
    const key = JSON.stringify(rest);
    const same = byRest.get(key);
    if (same === undefined) {
      const first = { ...combination };
      combinations.push(first);
      byRest.set(key, first);
    } else if (profiles !== undefined) {
      same.profiles = [...(same.profiles ?? []), ...profiles];
    }
  }
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
      return valuesOf(file, enumOf(type, subject) ?? "")
        .filter((each) => alike.includes(each))
        .join(", ");
    }
    return value;
  };
  const found: Cases["cases"] = [];
  const byValues = new Map<string, Cases["cases"][number]>();
  for (const combination of combinations) {
    const values: Record<string, string> = {};
    // With alike set aside, every combination is its own case, told apart
    // by all it has: every dimension, the parents' states and its own.
    if (!alike) {
      Object.assign(values, combination.dimensions, combination.parents, combination.states);
      found.push({ values, combinations: [combination] });
      continue;
    }
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
    const same = byValues.get(key);
    if (same !== undefined) same.combinations.push(combination);
    else {
      const first = { values, combinations: [combination] };
      found.push(first);
      byValues.set(key, first);
    }
  }
  return {
    name: target,
    subjects: [...type.needs, ...type.states].map(({ name }) => name),
    combinations: combinations.length,
    cases: found,
  };
}
