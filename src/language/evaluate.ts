import type { ParseResult } from "./ast.js";
import { profilesOf } from "./profiles.js";

// What a type's states are under each combination of the dimensions its
// rules use: one row per combination, in the order the dimensions are first
// used and their values declared.
export interface TypeStates {
  type: string;
  dimensions: string[];
  // With profiles, each row names its profiles: every profile with the same
  // values, which are one combination.
  rows: {
    profiles?: string[];
    when: Record<string, string>;
    states: Record<string, string[]>;
    // When the type has children: whether each is there in this row, or, when
    // that depends on a free state, the values of that state it is there for.
    children?: Record<string, Presence>;
  }[];
}

export type Presence = boolean | Record<string, string[]>;

// Evaluates a type of a parsed file, which must have no problems. A value of
// a state exists in a row unless a rule limits it to dimension values the row
// does not have; a derived state has the one value its when gives.
export function states(file: ParseResult, typeName: string): TypeStates {
  if (file.diagnostics.some(({ severity }) => severity === "error")) {
    throw new Error("cannot evaluate a file with problems");
  }
  const type = file.types.find(({ name }) => name === typeName);
  if (type === undefined) throw new Error(`no type ${typeName}`);
  // Where each child is in a row: by a dimension's value, or by the values a
  // state of the type has there.
  const withChildren = (row: TypeStates["rows"][number]): TypeStates["rows"][number] => {
    if (type.children.length === 0) return row;
    const presence = (child: (typeof type.children)[number]): Presence => {
      if (child.when === undefined) return true;
      const wanted = child.when.values.map(({ name }) => name);
      const on = child.when.on.name;
      const state = row.states[on];
      if (state === undefined) return wanted.includes(row.when[on] ?? "");
      const there = state.filter((value) => wanted.includes(value));
      if (there.length === 0) return false;
      return there.length === state.length ? true : { [on]: there };
    };
    return {
      ...row,
      children: Object.fromEntries(type.children.map((child) => [child.name, presence(child)])),
    };
  };
  const valuesOf = (name: string) =>
    [...file.enums, ...file.dimensions]
      .find((declaration) => declaration.name === name)
      ?.values.map(({ name }) => name) ?? [];
  const dimensions = type.needs.map(({ name }) => name);
  // With profiles, a row per profile, with the values it gives; the
  // dimensions it does not give still go through every value.
  const profiles = profilesOf(file);
  const given = new Set(
    file.environments
      .filter(({ name }) => profiles.some(({ environment }) => environment === name))
      .flatMap((environment) => environment.dimensions.map(({ name }) => name)),
  );
  // Profiles with the same values are one combination: one start, naming
  // them all, in the order the first of them comes.
  const groups = new Map<string, { profiles: string[]; when: Record<string, string> }>();
  for (const profile of profiles) {
    const key = JSON.stringify(Object.entries(profile.values).sort(([a], [b]) => (a < b ? -1 : 1)));
    const group = groups.get(key);
    if (group !== undefined) {
      group.profiles.push(profile.name);
      continue;
    }
    groups.set(key, {
      profiles: [profile.name],
      when: Object.fromEntries(
        Object.entries(profile.values).filter(([name]) => dimensions.includes(name)),
      ),
    });
  }
  const starts: { profiles?: string[]; when: Record<string, string> }[] =
    profiles.length === 0 ? [{ when: {} }] : [...groups.values()];
  let combinations = starts;
  for (const dimension of dimensions.filter(
    (name) => file.profiles.length === 0 || !given.has(name),
  )) {
    combinations = combinations.flatMap((start) =>
      valuesOf(dimension).map((value) => ({
        ...start,
        when: { ...start.when, [dimension]: value },
      })),
    );
  }
  return {
    type: type.name,
    dimensions,
    rows: combinations.map(({ profiles: named, when: chosen }) =>
      withChildren({
        ...(named === undefined ? {} : { profiles: named }),
        when: Object.fromEntries(dimensions.map((name) => [name, chosen[name] as string])),
        states: Object.fromEntries(
          type.states.map((state) => [
            state.name,
            state.derived === undefined
              ? valuesOf(state.enum.name).filter((value) =>
                  type.rules
                    .filter((rule) => rule.state.name === state.name && rule.value.name === value)
                    .every((rule) =>
                      rule.when.values.some(
                        ({ name }) => name === chosen[rule.when.dimension.name],
                      ),
                    ),
                )
              : // A derived state has the one value its when gives here.
                state.derived.branches
                  .filter(({ values }) =>
                    values.some(({ name }) => name === chosen[state.derived?.dimension.name ?? ""]),
                  )
                  .map(({ result }) => result.name),
          ]),
        ),
      }),
    ),
  };
}
