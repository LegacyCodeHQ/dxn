import type { Environment, ParseResult } from "./ast.js";

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

// The environment the profiles are instances of: that of the first profile
// whose environment is one, as profiles are checked against.
export function environmentOf(file: ParseResult): Environment | undefined {
  for (const { environment } of file.profiles) {
    const found = file.environments.find(({ name }) => name === environment.name);
    if (found !== undefined) return found;
  }
  return undefined;
}

// The dimensions the profiles give a value: their environment's, or none
// without profiles.
export function givenDimensions(file: ParseResult): string[] {
  return environmentOf(file)?.dimensions.map(({ name }) => name) ?? [];
}
