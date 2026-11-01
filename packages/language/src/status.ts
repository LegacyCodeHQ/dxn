import type { ParseResult, Type } from "./ast.js";
import { inPlace, states } from "./evaluate.js";
import { givenDimensions } from "./profiles.js";
import { penNode } from "./scalars.js";

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
  stale: number;
  gone: number;
  paths: {
    path: string;
    combinations: number;
    present: number;
    // The combinations whose entries all have a frame that changed since, or
    // that is no more; and those with no entry at all.
    stale: Combination[];
    gone: Combination[];
    missing: Combination[];
  }[];
}

// Whether what an entry points at is as it was recorded, changed since, or no
// more.
export type Freshness = "present" | "stale" | "gone";
// A PenNode as stored, which a check judges.
export type Check = (node: {
  file: string;
  frame: string;
  node?: string;
  fingerprint: string;
}) => Freshness;

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

// A row's states, split: one value for each state, in every combination of
// the values each can have.
export function split(states: Record<string, string[]>): Record<string, string>[] {
  let expanded: Record<string, string>[] = [{}];
  for (const [name, values] of Object.entries(states)) {
    expanded = expanded.flatMap((each) => values.map((value) => ({ ...each, [name]: value })));
  }
  return expanded;
}

// A type's combinations on its own, each with one value for each state: its
// rows of dxn states, split, with no parents.
export function alone(file: ParseResult, typeName: string): Combination[] {
  return states(file, typeName).rows.flatMap((row) =>
    split(row.states).map((own) => ({
      ...(row.profiles === undefined ? {} : { profiles: row.profiles }),
      dimensions: row.when,
      parents: {},
      states: own,
    })),
  );
}

// An element's combinations in place, each with one value for each state:
// its rows of dxn states, split.
export function expand(file: ParseResult, path: string, given: string[]): Combination[] {
  const combinations: Combination[] = [];
  for (const row of inPlace(file, path).rows) {
    const dimensions = Object.fromEntries(
      Object.entries(row.when).filter(([name]) => !given.includes(name)),
    );
    for (const states of split(row.states)) {
      combinations.push({
        ...(row.profiles === undefined ? {} : { profiles: row.profiles }),
        dimensions,
        parents: row.parents,
        states,
      });
    }
  }
  return combinations;
}

// An element's combinations as contexts give them, those that differ only in
// their profiles as one, with all their profiles: the profiles differ in
// dimensions the element does not have. Two that differ in a dimension it
// has, even one a profile gives, stay apart.
function merged(file: ParseResult, path: string, given: string[]): Combination[] {
  const result: Combination[] = [];
  const byKey = new Map<string, Combination>();
  for (const full of expand(file, path, [])) {
    const { profiles, ...rest } = full;
    const key = JSON.stringify(rest);
    const same = byKey.get(key);
    if (same === undefined) {
      // As a context gives it: without the dimensions the profiles give.
      const dimensions = Object.fromEntries(
        Object.entries(full.dimensions).filter(([name]) => !given.includes(name)),
      );
      const combination = { ...full, dimensions };
      result.push(combination);
      byKey.set(key, combination);
    } else if (profiles !== undefined) {
      same.profiles = [...(same.profiles ?? []), ...profiles];
    }
  }
  return result;
}

// How much of the trees a record an actor records covers: every combination of
// every element, in place, and which a stored record is about. Profiles that
// share a row count as one. With a check, each entry is present, stale or
// gone by its frame, and a combination is as its best entry is. The file and
// the data must have no problems.
export function coverage(
  file: ParseResult,
  record: string,
  sources: string[],
  check?: Check,
): Coverage {
  const given = givenDimensions(file);
  const declared = file.records.find(({ name }) => name === record);
  // An entry is as fresh as the least fresh of its PenNodes: gone, then
  // stale, then present.
  const pens = (declared?.fields ?? [])
    .filter(({ type }) => type.name === penNode.name)
    .map(({ name }) => name);
  const order: Freshness[] = ["gone", "stale", "present"];
  const freshness = (entry: Record<string, unknown>): Freshness => {
    if (check === undefined) return "present";
    const judged = pens.flatMap((field) => {
      const at = entry[field] as Parameters<Check>[0] | undefined;
      return at === undefined ? [] : [check(at)];
    });
    return order.find((each) => judged.includes(each)) ?? "present";
  };
  const contexts = sources.flatMap((source) =>
    (JSON.parse(source) as ({ context: Record<string, unknown> } & Record<string, unknown>)[]).map(
      (entry) => {
        const { context } = entry;
        return {
          path: (context.path ?? context.type) as string,
          profile: context.profile as string | undefined,
          dimensions: (context.dimensions ?? {}) as Record<string, string>,
          parents: (context.parents ?? {}) as Record<string, string>,
          states: (context.states ?? {}) as Record<string, string>,
          freshness: freshness(entry),
        };
      },
    ),
  );
  const same = (a: Record<string, string>, b: Record<string, string>) =>
    Object.keys(a).length === Object.keys(b).length &&
    Object.entries(a).every(([name, value]) => b[name] === value);
  // The stored contexts by the path they are about.
  const byPath = new Map<string, typeof contexts>();
  for (const context of contexts) {
    byPath.set(context.path, [...(byPath.get(context.path) ?? []), context]);
  }
  const paths = treePaths(file).map((path) => {
    const combinations = merged(file, path, given);
    const about = byPath.get(path) ?? [];
    // A combination is as its best entry is: present, else stale, else gone.
    const state = (combination: Combination): Freshness | "missing" => {
      const found = about
        .filter(
          (context) =>
            (combination.profiles === undefined ||
              combination.profiles.includes(context.profile ?? "")) &&
            same(context.dimensions, combination.dimensions) &&
            same(context.parents, combination.parents) &&
            same(context.states, combination.states),
        )
        .map(({ freshness }) => freshness);
      return (
        (["present", "stale", "gone"] as const).find((best) => found.includes(best)) ?? "missing"
      );
    };
    const states = combinations.map((combination) => ({ combination, state: state(combination) }));
    const those = (wanted: Freshness | "missing") =>
      states.filter(({ state: found }) => found === wanted).map(({ combination }) => combination);
    return {
      path,
      combinations: combinations.length,
      present: those("present").length,
      stale: those("stale"),
      gone: those("gone"),
      missing: those("missing"),
    };
  });
  const total = (of: (path: (typeof paths)[number]) => number) =>
    paths.reduce((sum, path) => sum + of(path), 0);
  return {
    record,
    combinations: total(({ combinations }) => combinations),
    present: total(({ present }) => present),
    stale: total(({ stale }) => stale.length),
    gone: total(({ gone }) => gone.length),
    paths,
  };
}
