import type { ParseResult } from "./ast.js";

// A profile with its values: one the file declares, or one a modifier makes,
// named "<profile>+<modifier>".
export interface Resolved {
  name: string;
  environment: string;
  values: Record<string, string>;
}

// Every profile of a file without problems: those it declares, then those
// each modifier makes, on its profiles in order.
export function profilesOf(file: ParseResult): Resolved[] {
  const declared = file.profiles.map((profile) => ({
    name: profile.name,
    environment: profile.environment.name,
    values: Object.fromEntries(
      profile.values.map(({ dimension, value }) => [dimension.name, value.name]),
    ),
  }));
  const made = file.modifiers.flatMap((modifier) =>
    modifier.on.flatMap(({ name }) => {
      const base = declared.find((profile) => profile.name === name);
      if (base === undefined) return [];
      const set = modifier.values.map(({ dimension, value }) => [dimension.name, value.name]);
      return [
        {
          name: `${base.name}+${modifier.name}`,
          environment: base.environment,
          values: { ...base.values, ...Object.fromEntries(set) },
        },
      ];
    }),
  );
  return [...declared, ...made];
}
