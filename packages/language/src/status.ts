import type { ParseResult, Type } from "./ast.js";
import { fieldValue } from "./derive.js";
import { inPlace } from "./evaluate.js";
import { environmentOf } from "./profiles.js";

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

// Whether an entry's frame is as it was recorded, changed since, or no more.
export type Freshness = "present" | "stale" | "gone";
export type Check = (entry: {
  file: string;
  frame: string;
  fingerprint: string;
  // By convention, how the frame is fingerprinted: pen-dev or file.
  tool?: string;
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

// An element's combinations in place, each with one value for each state:
// its rows of dxn states, split.
export function expand(file: ParseResult, path: string, given: string[]): Combination[] {
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
  return combinations;
}

// An element's combinations as contexts give them, those that differ only in
// their profiles as one, with all their profiles: the profiles differ in
// dimensions the element does not have. Two that differ in a dimension it
// has, even one a profile gives, stay apart.
function merged(file: ParseResult, path: string, given: string[]): Combination[] {
  const full = expand(file, path, []);
  const result: { key: string; combination: Combination }[] = [];
  expand(file, path, given).forEach((combination, index) => {
    const { profiles: _, ...rest } = full[index] as Combination;
    const key = JSON.stringify(rest);
    const same = result.find((each) => each.key === key);
    if (same === undefined) result.push({ key, combination: { ...combination } });
    else if (combination.profiles !== undefined) {
      same.combination.profiles = [...(same.combination.profiles ?? []), ...combination.profiles];
    }
  });
  return result.map(({ combination }) => combination);
}

// How much of the trees a record with context covers: every combination of
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
  const environment = environmentOf(file);
  const given = environment?.dimensions.map(({ name }) => name) ?? [];
  const declared = file.records.find(({ name }) => name === record);
  const contexts = sources.flatMap((source) =>
    (
      JSON.parse(source) as {
        context: Record<string, unknown>;
        source?: { file?: string; frame?: string };
        fingerprint?: string;
      }[]
    )
      .map((entry) => ({
        ...entry,
        tool: declared === undefined ? undefined : fieldValue(declared, entry, "tool"),
      }))
      .map(({ context, source: where, fingerprint, tool }) => ({
        path: (context.path ?? context.type) as string,
        profile: context.profile as string | undefined,
        dimensions: (context.dimensions ?? {}) as Record<string, string>,
        parents: (context.parents ?? {}) as Record<string, string>,
        states: (context.states ?? {}) as Record<string, string>,
        freshness:
          check === undefined ||
          where?.file === undefined ||
          where.frame === undefined ||
          fingerprint === undefined
            ? ("present" as Freshness)
            : check({
                file: where.file,
                frame: where.frame,
                fingerprint,
                ...(typeof tool === "string" ? { tool } : {}),
              }),
      })),
  );
  const same = (a: Record<string, string>, b: Record<string, string>) =>
    Object.keys(a).length === Object.keys(b).length &&
    Object.entries(a).every(([name, value]) => b[name] === value);
  const paths = treePaths(file).map((path) => {
    const combinations = merged(file, path, given);
    // A combination is as its best entry is: present, else stale, else gone.
    const state = (combination: Combination): Freshness | "missing" => {
      const found = contexts
        .filter(
          (context) =>
            context.path === path &&
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
