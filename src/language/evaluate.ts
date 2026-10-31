import type { ParseResult } from "./parse.js";

// What a type's states are under each combination of the dimensions its
// rules use: one row per combination, in the order the dimensions are first
// used and their values declared.
export interface TypeStates {
  type: string;
  dimensions: string[];
  rows: { when: Record<string, string>; states: Record<string, string[]> }[];
}

// Evaluates a type of a parsed file without problems. A value of a state
// exists in a row unless a rule limits it to dimension values the row does
// not have.
export function states(file: ParseResult, typeName: string): TypeStates {
  const type = file.types.find(({ name }) => name === typeName);
  if (type === undefined) throw new Error(`no type ${typeName}`);
  const valuesOf = (name: string) =>
    [...file.enums, ...file.dimensions]
      .find((declaration) => declaration.name === name)
      ?.values.map(({ name }) => name) ?? [];
  const dimensions = [...new Set(type.rules.map(({ when }) => when.dimension))];
  let combinations: Record<string, string>[] = [{}];
  for (const dimension of dimensions) {
    combinations = combinations.flatMap((chosen) =>
      valuesOf(dimension).map((value) => ({ ...chosen, [dimension]: value })),
    );
  }
  return {
    type: type.name,
    dimensions,
    rows: combinations.map((when) => ({
      when,
      states: Object.fromEntries(
        type.states.map((state) => [
          state.name,
          valuesOf(state.enum).filter((value) =>
            type.rules
              .filter((rule) => rule.state === state.name && rule.value === value)
              .every((rule) =>
                rule.when.values.some(({ name }) => name === when[rule.when.dimension]),
              ),
          ),
        ]),
      ),
    })),
  };
}
