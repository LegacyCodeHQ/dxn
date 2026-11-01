import type { Located, ParseResult, Type } from "./ast.js";
import { inPlace, placement, states } from "./evaluate.js";
import { givenDimensions, profilesOf } from "./profiles.js";
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

// A stored record made before its element gained a state or a dimension:
// what it says, "style = filled", what it does not, and the record.
export interface Outdated {
  says: string;
  added: string[];
  entry: Record<string, unknown>;
}

export interface Coverage {
  record: string;
  combinations: number;
  present: number;
  stale: number;
  gone: number;
  outdated: number;
  paths: {
    path: string;
    combinations: number;
    present: number;
    // The combinations whose entries all have a frame that changed since, or
    // that is no more; and those with no entry at all.
    stale: Combination[];
    gone: Combination[];
    missing: Combination[];
    outdated: Outdated[];
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
  return treePlaces(file).map(({ path }) => path);
}

// Every element of the file's trees, by its path, with its type and where its
// name is written: a type that no type contains, by its own name; a child, by
// the name its parent gives it. A type declared at the top of the file is a
// component, a tree of its own though another type contains it: what it is
// wherever it is placed, unless it needs what its parent provides. A type
// declared inside another is only in place.
export function treePlaces(file: ParseResult): { path: string; type: string; at: Located }[] {
  const contained = new Set(
    file.types.flatMap(({ children }) => children.map(({ type }) => type.name)),
  );
  const byName = new Map(file.types.map((type) => [type.name, type]));
  const places: { path: string; type: string; at: Located }[] = [];
  const walk = (type: Type, path: string, at: Located) => {
    places.push({ path, type: type.name, at });
    for (const child of type.children) {
      const inner = byName.get(child.type.name);
      if (inner !== undefined) walk(inner, `${path}.${child.name}`, child);
    }
  };
  // A component stands on its own when nothing in it needs a state from
  // above it.
  const alone = (type: Type) => {
    try {
      placement(file, type.name);
      return true;
    } catch {
      return false;
    }
  };
  for (const type of file.types) {
    if (!contained.has(type.name)) walk(type, type.name, type);
    else if (type.scope === undefined && alone(type)) walk(type, type.name, type);
  }
  return places;
}

// A combination, as its path and where it is: "<path> on <profiles>,
// <Dimension> <value> with <parent> = <value>: <state> = <value>". A
// combination on every profile is the same on all of them.
export function describe(file: ParseResult, path: string, combination: Combination): string {
  const every = profilesOf(file).map(({ name }) => name);
  const covered = combination.profiles ?? [];
  const assignments = (pairs: Record<string, string>) =>
    Object.entries(pairs)
      .map(([name, value]) => `${name} = ${value}`)
      .join(", ");
  const world = [
    ...(every.every((name) => covered.includes(name)) ? [] : covered),
    ...Object.entries(combination.dimensions).map(([name, value]) => `${name} ${value}`),
  ].join(", ");
  const parents = assignments(combination.parents);
  const states = assignments(combination.states);
  return `${path}${world === "" ? "" : ` on ${world}`}${parents === "" ? "" : ` with ${parents}`}${states === "" ? "" : `: ${states}`}`;
}

// Where each element of the trees is written, how much of it each record an
// actor records covers: its combinations, how many are present, stale and
// gone, and those not present, described. An element written in one place
// and placed in several, as a child of a type that is, counts all of them
// there. The file and the data must have no problems.
export interface Progress {
  line: number;
  column: number;
  records: {
    record: string;
    combinations: number;
    present: number;
    stale: number;
    gone: number;
    listed: { missing: string[]; stale: string[]; gone: string[] };
    // The stored records about the place made before its element gained a
    // state or a dimension, each about one of its paths.
    outdated: (Outdated & { path: string })[];
  }[];
}

export function progress(
  file: ParseResult,
  stored: { record: string; source: string }[],
  check?: Check,
): Progress[] {
  const recorded = file.records.filter(({ context }) => context);
  const covered = recorded.map(({ name }) =>
    coverage(
      file,
      name,
      stored.filter(({ record }) => record === name).map(({ source }) => source),
      // A record without a PenNode has nothing to check.
      recorded
        .find((each) => each.name === name)
        ?.fields.some(({ type }) => type.name === penNode.name)
        ? check
        : undefined,
    ),
  );
  const byPlace = new Map<string, Progress>();
  for (const { path, at } of treePlaces(file)) {
    const key = `${at.line}:${at.column}`;
    const place = byPlace.get(key) ?? { line: at.line, column: at.column, records: [] };
    byPlace.set(key, place);
    for (const report of covered) {
      const found = report.paths.find((each) => each.path === path);
      if (found === undefined) continue;
      let counted = place.records.find(({ record }) => record === report.record);
      if (counted === undefined) {
        counted = {
          record: report.record,
          combinations: 0,
          present: 0,
          stale: 0,
          gone: 0,
          listed: { missing: [], stale: [], gone: [] },
          outdated: [],
        };
        place.records.push(counted);
      }
      counted.combinations += found.combinations;
      counted.present += found.present;
      counted.stale += found.stale.length;
      counted.gone += found.gone.length;
      counted.outdated.push(...found.outdated.map((each) => ({ ...each, path })));
      for (const of of ["missing", "stale", "gone"] as const) {
        counted.listed[of].push(
          ...found[of].map((combination) => describe(file, path, combination)),
        );
      }
    }
  }
  return [...byPlace.values()].sort((a, b) => a.line - b.line || a.column - b.column);
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

// An element's looks in place: its combinations as contexts give them, by
// its own states and dimensions, those that differ only in their profiles, or
// in the states of the parents that place it, as one. A place can only allow
// fewer of an element's looks, never more: the profiles differ in dimensions
// the element does not have, and the parents' states only decide its own.
// Two that differ in a dimension it has, even one a profile gives, stay apart.
function merged(file: ParseResult, path: string, given: string[]): Combination[] {
  const result: Combination[] = [];
  const byKey = new Map<string, Combination>();
  for (const full of expand(file, path, [])) {
    const { profiles, parents: _parents, ...rest } = full;
    const key = JSON.stringify(rest);
    const same = byKey.get(key);
    if (same === undefined) {
      // As a context gives it: without the dimensions the profiles give.
      const dimensions = Object.fromEntries(
        Object.entries(full.dimensions).filter(([name]) => !given.includes(name)),
      );
      const combination = { ...full, dimensions, parents: {} };
      result.push(combination);
      byKey.set(key, combination);
    } else if (profiles !== undefined) {
      same.profiles = [...(same.profiles ?? []), ...profiles];
    }
  }
  return result;
}

// A combination of an element in place, as the stored records judge it: as
// its best entry is, present, else stale, else gone; or missing without one;
// with that entry.
export interface Judged {
  combination: Combination;
  state: Freshness | "missing";
  entry?: Record<string, unknown>;
}

// Every combination of every element of the trees, in place, by its path, as
// a record's stored records judge it. Profiles that share a row count as one.
// With a check, each entry is present, stale or gone by its PenNodes. The file
// and the data must have no problems.
export function judge(
  file: ParseResult,
  record: string,
  sources: string[],
  check?: Check,
): { path: string; combinations: Judged[]; outdated: Outdated[] }[] {
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
          entry,
        };
      },
    ),
  );
  const same = (a: Record<string, string>, b: Record<string, string>) =>
    Object.keys(a).length === Object.keys(b).length &&
    Object.entries(a).every(([name, value]) => b[name] === value);
  // The stored contexts by the path they are about, and by the type of the
  // element they are about.
  const byPath = new Map<string, typeof contexts>();
  for (const context of contexts) {
    byPath.set(context.path, [...(byPath.get(context.path) ?? []), context]);
  }
  const places = treePlaces(file);
  const typeOf = new Map(places.map(({ path, type }) => [path, type]));
  const byType = new Map<string, typeof contexts>();
  for (const context of contexts) {
    const type = typeOf.get(context.path);
    if (type !== undefined) byType.set(type, [...(byType.get(type) ?? []), context]);
  }
  return places.map(({ path, type }) => {
    const about = byPath.get(path) ?? [];
    // An element's entries elsewhere, its component's or its other places',
    // stand for it here in the same look.
    const alike = (byType.get(type) ?? []).filter((context) => context.path !== path);
    const looks = (context: (typeof contexts)[number], combination: Combination) =>
      (combination.profiles === undefined ||
        combination.profiles.includes(context.profile ?? "")) &&
      same(context.dimensions, combination.dimensions) &&
      same(context.states, combination.states);
    // A look is as its best entry is: one about it in this place, whatever
    // the parents' states that placed it, or else one about it elsewhere, its
    // component's or another place's, in the same look.
    const judged = (combination: Combination): Judged => {
      for (const found of [
        about.filter((context) => looks(context, combination)),
        alike.filter((context) => looks(context, combination)),
      ]) {
        for (const best of ["present", "stale", "gone"] as const) {
          const entry = found.find(({ freshness: each }) => each === best);
          if (entry !== undefined) return { combination, state: best, entry: entry.entry };
        }
      }
      return { combination, state: "missing" };
    };
    const combinations = merged(file, path, given);
    // The names a context of the path gives; an entry that gives some of
    // them and nothing else, but not all, was made before the rest were.
    const names = new Set(
      combinations.flatMap(({ dimensions, states }) => [
        ...Object.keys(dimensions),
        ...Object.keys(states),
      ]),
    );
    const outdated = about.flatMap(({ dimensions, states, entry }) => {
      const given = [...Object.keys(dimensions), ...Object.keys(states)];
      const added = [...names].filter((name) => !given.includes(name));
      if (added.length === 0 || !given.every((name) => names.has(name))) return [];
      const says = Object.entries({ ...dimensions, ...states })
        .map(([name, value]) => `${name} = ${value}`)
        .join(", ");
      return [{ says, added, entry }];
    });
    return { path, combinations: combinations.map(judged), outdated };
  });
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
  const paths = judge(file, record, sources, check).map(({ path, combinations, outdated }) => {
    const those = (wanted: Freshness | "missing") =>
      combinations.filter(({ state }) => state === wanted).map(({ combination }) => combination);
    return {
      path,
      combinations: combinations.length,
      present: those("present").length,
      stale: those("stale"),
      gone: those("gone"),
      missing: those("missing"),
      outdated,
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
    outdated: total(({ outdated }) => outdated.length),
    paths,
  };
}
