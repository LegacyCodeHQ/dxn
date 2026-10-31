import type { ParseResult, Type } from "./ast.js";
import { inPlace } from "./evaluate.js";

// One combination of an element in place: the profiles that share it, the
// dimensions no profile gives, the parents' states that place it, and one
// value for each of its states.
export interface Combination {
  profiles?: string[];
  dimensions: Record<string, string>;
  parents: Record<string, string>;
  states: Record<string, string>;
}

export interface Coverage {
  record: string;
  combinations: number;
  present: number;
  paths: { path: string; combinations: number; present: number; missing: Combination[] }[];
}

// Every element of the file's trees, by its path: each type that no type
// contains, then each of its children, theirs, and so on.
export function treePaths(file: ParseResult): string[] {
  const contained = new Set(
    file.types.flatMap(({ children }) => children.map(({ type }) => type.name)),
  );
  const byName = new Map(file.types.map((type) => [type.name, type]));
  const paths: string[] = [];
  const walk = (type: Type, path: string) => {
    paths.push(path);
    for (const child of type.children) {
      const inner = byName.get(child.type.name);
      if (inner !== undefined) walk(inner, `${path}.${child.name}`);
    }
  };
  for (const type of file.types) if (!contained.has(type.name)) walk(type, type.name);
  return paths;
}

// How much of the trees a record with context covers: every combination of
// every element, in place, and which a stored record is about. Profiles that
// share a row count as one. The file and the data must have no problems.
export function coverage(file: ParseResult, record: string, sources: string[]): Coverage {
  const environment = file.environments.find(
    ({ name }) => name === file.profiles[0]?.environment.name,
  );
  const given = environment?.dimensions.map(({ name }) => name) ?? [];
  const contexts = sources.flatMap((source) =>
    (JSON.parse(source) as { context: Record<string, unknown> }[]).map(({ context }) => ({
      path: (context.path ?? context.type) as string,
      profile: context.profile as string | undefined,
      dimensions: (context.dimensions ?? {}) as Record<string, string>,
      parents: (context.parents ?? {}) as Record<string, string>,
      states: (context.states ?? {}) as Record<string, string>,
    })),
  );
  const same = (a: Record<string, string>, b: Record<string, string>) =>
    Object.keys(a).length === Object.keys(b).length &&
    Object.entries(a).every(([name, value]) => b[name] === value);
  const paths = treePaths(file).map((path) => {
    const combinations: Combination[] = [];
    for (const row of inPlace(file, path).rows) {
      let expanded: Record<string, string>[] = [{}];
      for (const [name, values] of Object.entries(row.states)) {
        expanded = expanded.flatMap((states) =>
          values.map((value) => ({ ...states, [name]: value })),
        );
      }
      const dimensions = Object.fromEntries(
        Object.entries(row.when).filter(([name]) => !given.includes(name)),
      );
      for (const states of expanded) {
        combinations.push({
          ...(row.profiles === undefined ? {} : { profiles: row.profiles }),
          dimensions,
          parents: row.parents,
          states,
        });
      }
    }
    const covered = (combination: Combination) =>
      contexts.some(
        (context) =>
          context.path === path &&
          (combination.profiles === undefined ||
            combination.profiles.includes(context.profile ?? "")) &&
          same(context.dimensions, combination.dimensions) &&
          same(context.parents, combination.parents) &&
          same(context.states, combination.states),
      );
    const missing = combinations.filter((combination) => !covered(combination));
    return {
      path,
      combinations: combinations.length,
      present: combinations.length - missing.length,
      missing,
    };
  });
  return {
    record,
    combinations: paths.reduce((total, { combinations }) => total + combinations, 0),
    present: paths.reduce((total, { present }) => total + present, 0),
    paths,
  };
}
