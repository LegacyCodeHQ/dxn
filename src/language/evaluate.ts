import type { ParseResult } from "./ast.js";

// What a type's states are under each combination of the dimensions its
// rules use: one row per combination, in the order the dimensions are first
// used and their values declared.
export interface TypeStates {
  type: string;
  dimensions: string[];
  // With profiles, each row names its profile.
  rows: { profile?: string; when: Record<string, string>; states: Record<string, string[]> }[];
}

// Evaluates a type of a parsed file, which must have no problems. A value of
// a state exists in a row unless a rule limits it to dimension values the row
// does not have.
export function states(file: ParseResult, typeName: string): TypeStates {
  if (file.diagnostics.some(({ severity }) => severity === "error")) {
    throw new Error("cannot evaluate a file with problems");
  }
  const type = file.types.find(({ name }) => name === typeName);
  if (type === undefined) throw new Error(`no type ${typeName}`);
  const valuesOf = (name: string) =>
    [...file.enums, ...file.dimensions]
      .find((declaration) => declaration.name === name)
      ?.values.map(({ name }) => name) ?? [];
  const dimensions = type.needs.map(({ name }) => name);
  // With profiles, a row per profile, with the values it gives; the
  // dimensions it does not give still go through every value.
  const given = new Set(
    file.environments
      .filter(({ name }) => file.profiles.some(({ environment }) => environment.name === name))
      .flatMap((environment) => environment.dimensions.map(({ name }) => name)),
  );
  const starts: { profile?: string; when: Record<string, string> }[] =
    file.profiles.length === 0
      ? [{ when: {} }]
      : file.profiles.map((profile) => ({
          profile: profile.name,
          when: Object.fromEntries(
            profile.values
              .filter(({ dimension }) => dimensions.includes(dimension.name))
              .map(({ dimension, value }) => [dimension.name, value.name]),
          ),
        }));
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
    rows: combinations.map(({ profile, when: chosen }) => ({
      ...(profile === undefined ? {} : { profile }),
      when: Object.fromEntries(dimensions.map((name) => [name, chosen[name] as string])),
      states: Object.fromEntries(
        type.states.map((state) => [
          state.name,
          valuesOf(state.enum.name).filter((value) =>
            type.rules
              .filter((rule) => rule.state.name === state.name && rule.value.name === value)
              .every((rule) =>
                rule.when.values.some(({ name }) => name === chosen[rule.when.dimension.name]),
              ),
          ),
        ]),
      ),
    })),
  };
}
