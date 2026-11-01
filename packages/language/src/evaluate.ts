import type { Child, ParseResult, State, Type } from "./ast.js";
import { conditionText, holds, subjects } from "./condition.js";
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

// A child is there, not there, there for some values of one state, or, when
// it depends on several, where its condition holds.
export type Presence = boolean | Record<string, string[]> | string;

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
      const when = child.when;
      if (when === undefined) return true;
      // The states it compares, each with the values it has here; a
      // dimension has the row's value.
      const free = subjects(when)
        .map(({ name }) => name)
        .filter((name) => row.states[name] !== undefined);
      let combinations: Record<string, string>[] = [{}];
      for (const name of free) {
        combinations = combinations.flatMap((combination) =>
          (row.states[name] ?? []).map((value) => ({ ...combination, [name]: value })),
        );
      }
      const there = combinations.filter((combination) =>
        holds(when, (name) => combination[name] ?? row.when[name]),
      );
      if (there.length === 0) return false;
      if (there.length === combinations.length) return true;
      // The states that still decide here: those whose value changes whether
      // it holds, with the others' values the same.
      const key = (combination: Record<string, string>, without: string) =>
        JSON.stringify(free.filter((name) => name !== without).map((name) => combination[name]));
      const deciding = free.filter((name) => {
        const outcomes = new Map<string, boolean>();
        for (const combination of combinations) {
          const holding = there.includes(combination);
          const earlier = outcomes.get(key(combination, name));
          if (earlier !== undefined && earlier !== holding) return true;
          outcomes.set(key(combination, name), holding);
        }
        return false;
      });
      // On one state, for which of its values; on several, the condition.
      const [only] = deciding;
      return deciding.length === 1 && only !== undefined
        ? {
            [only]: [...new Set(there.map((combination) => combination[only] as string))],
          }
        : conditionText(when);
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
  const groups = profileGroups(file).map(({ profiles: named, values }) => ({
    profiles: named,
    when: Object.fromEntries(Object.entries(values).filter(([name]) => dimensions.includes(name))),
  }));
  const starts: { profiles?: string[]; when: Record<string, string> }[] =
    profiles.length === 0 ? [{ when: {} }] : groups;
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
  // The states a rule depends on, which the rows are split by: each state's
  // values follow from those of the states before it.
  const depends = new Map(
    type.states.map((state) => [
      state.name,
      type.rules
        .filter((rule) => rule.state.name === state.name)
        .flatMap((rule) => subjects(rule.when).map(({ name }) => name))
        .filter((name) => type.states.some((other) => other.name === name)),
    ]),
  );
  const deciding = new Set([...depends.values()].flat());
  const order: State[] = [];
  const visit = (state: State, seen: Set<string>) => {
    if (order.includes(state) || seen.has(state.name)) return;
    seen.add(state.name);
    for (const name of depends.get(state.name) ?? []) {
      const before = type.states.find((other) => other.name === name);
      if (before !== undefined) visit(before, seen);
    }
    order.push(state);
  };
  for (const state of type.states) visit(state, new Set());
  // A state's values in a combination, with the values of the states before
  // it: those whose rules hold there.
  const valuesIn = (
    state: State,
    chosen: Record<string, string>,
    settled: Record<string, string[]>,
  ) =>
    state.fixed !== undefined
      ? [state.fixed.name]
      : state.derived === undefined
        ? valuesOf(state.enum.name).filter((value) =>
            type.rules
              .filter((rule) => rule.state.name === state.name && rule.value.name === value)
              .every((rule) => holds(rule.when, (name) => chosen[name] ?? settled[name]?.[0])),
          )
        : // A derived state has the one value its when gives here.
          state.derived.branches
            .filter(({ values }) =>
              values.some(({ name }) => name === chosen[state.derived?.dimension.name ?? ""]),
            )
            .map(({ result }) => result.name);
  return {
    type: type.name,
    dimensions,
    rows: combinations.flatMap(({ profiles: named, when: chosen }) => {
      let settled: Record<string, string[]>[] = [{}];
      for (const state of order) {
        settled = settled.flatMap((before) => {
          const values = valuesIn(state, chosen, before);
          // One row for each value of a state another depends on.
          return deciding.has(state.name) && values.length > 0
            ? values.map((value) => ({ ...before, [state.name]: [value] }))
            : [{ ...before, [state.name]: values }];
        });
      }
      return settled.map((own) =>
        withChildren({
          ...(named === undefined ? {} : { profiles: named }),
          when: Object.fromEntries(dimensions.map((name) => [name, chosen[name] as string])),
          states: Object.fromEntries(type.states.map(({ name }) => [name, own[name] ?? []])),
        }),
      );
    }),
  };
}

// A child's combinations inside its parents, by its path from a type:
// "<Type>.<child>.<child>...".
export interface InPlace {
  path: string;
  type: string;
  // The dimensions of every type on the way, in the order first needed.
  dimensions: string[];
  rows: {
    profiles?: string[];
    when: Record<string, string>;
    // The states of the parents on the way that decide where the child is, or
    // that it is given, by their path: "layout", "menu.menu".
    parents: Record<string, string>;
    states: Record<string, string[]>;
  }[];
}

// Evaluates a child in place: for each world (a group of profiles, and any
// other dimension the types on the way need), walks down the path, trying
// each parent's states that decide whether the next child is there or that
// it binds into it, keeping where the child is, and setting its bound
// states. Its own states are those it has in that world.
export function inPlace(file: ParseResult, path: string): InPlace {
  if (file.diagnostics.some(({ severity }) => severity === "error")) {
    throw new Error("cannot evaluate a file with problems");
  }
  const place = placement(file, path);
  const { steps: chain, dimensions } = place;
  type Step = Placement["steps"][number];
  const valuesOf = (name: string) =>
    file.dimensions
      .find((declaration) => declaration.name === name)
      ?.values.map(({ name }) => name) ?? [];
  // The worlds: each group of profiles with the same values, or one with no
  // profile; then every value of each dimension no profile gives.
  const groups = profileGroups(file);
  let worlds: { profiles?: string[]; when: Record<string, string> }[] =
    groups.length === 0
      ? [{ when: {} }]
      : groups.map(({ profiles, values }) => ({ profiles, when: values }));
  for (const dimension of dimensions) {
    if (worlds.every(({ when }) => when[dimension] !== undefined)) continue;
    worlds = worlds.flatMap((world) =>
      valuesOf(dimension).map((value) => ({
        ...world,
        when: { ...world.when, [dimension]: value },
      })),
    );
  }
  const evaluated = new Map<string, TypeStates>();
  // A type's rows in a world: one, or one for each value of a state another
  // depends on.
  const rowsOf = (type: Type, world: (typeof worlds)[number]) => {
    let alone = evaluated.get(type.name);
    if (alone === undefined) {
      alone = states(file, type.name);
      evaluated.set(type.name, alone);
    }
    return alone.rows.filter(
      (row) =>
        (world.profiles === undefined ||
          row.profiles?.includes(world.profiles[0] as string) === true) &&
        Object.entries(row.when).every(([name, value]) => world.when[name] === value),
    );
  };
  const rows: InPlace["rows"] = [];
  const walk = (
    world: (typeof worlds)[number],
    level: number,
    fixed: Record<string, string>,
    parents: Record<string, string>,
  ) => {
    const { type } = chain[level] as Step;
    for (const row of rowsOf(type, world)) walkRow(world, level, fixed, parents, row);
  };
  const walkRow = (
    world: (typeof worlds)[number],
    level: number,
    given: Record<string, string>,
    parents: Record<string, string>,
    row: TypeStates["rows"][number],
  ) => {
    const { type, prefix } = chain[level] as Step;
    let fixed = given;
    // A received state has the value its provider has here.
    for (const { name } of type.states.filter((state) => state.received)) {
      const key = place.providerKey(level, name);
      const value = key === undefined ? undefined : parents[key];
      if (value !== undefined) fixed = { ...fixed, [name]: value };
    }
    // A state's values here: the one it is given, when it is bound.
    const available = (name: string) => {
      const values = row.states[name] ?? [];
      const given = fixed[name];
      return given === undefined ? values : values.filter((value) => value === given);
    };
    // A state left with no value, given one its rules remove: the type
    // cannot be here, nor anything below it.
    const own = Object.fromEntries(type.states.map(({ name }) => [name, available(name)]));
    if (Object.values(own).some((values) => values.length === 0)) return;
    const next = chain[level + 1]?.child;
    if (next === undefined) {
      rows.push({
        ...(world.profiles === undefined ? {} : { profiles: world.profiles }),
        when: Object.fromEntries(dimensions.map((name) => [name, world.when[name] as string])),
        parents,
        states: own,
      });
      return;
    }
    const deciding =
      next.when === undefined
        ? []
        : subjects(next.when)
            .map(({ name }) => name)
            .filter((name) => /^[a-z]/.test(name));
    // The states that decide the next child, that it is given, or that a type
    // further down receives from here.
    const provided = place.received.filter(({ from }) => from === level).map(({ name }) => name);
    const relevant = [
      ...new Set([...deciding, ...(next.bindings ?? []).map(({ from }) => from.name), ...provided]),
    ];
    let combinations: Record<string, string>[] = [{}];
    for (const name of relevant) {
      combinations = combinations.flatMap((combination) =>
        available(name).map((value) => ({ ...combination, [name]: value })),
      );
    }
    for (const combination of combinations) {
      if (
        next.when !== undefined &&
        !holds(next.when, (name) => (/^[a-z]/.test(name) ? combination[name] : world.when[name]))
      ) {
        continue;
      }
      const given = Object.fromEntries(
        (next.bindings ?? []).map(({ state, from, map }) => {
          const value = combination[from.name] as string;
          const mapped = map?.find(({ values }) => values.some(({ name }) => name === value));
          return [state.name, mapped === undefined ? value : mapped.result.name];
        }),
      );
      // A received state is named by its provider's key, already given.
      const received = new Set(
        type.states.filter((state) => state.received).map(({ name }) => name),
      );
      const named = Object.fromEntries(
        Object.entries(combination)
          .filter(([name]) => !received.has(name))
          .map(([name, value]) => [prefix === "" ? name : `${prefix}.${name}`, value]),
      );
      walk(world, level + 1, given, { ...parents, ...named });
    }
  };
  for (const world of worlds) walk(world, 0, {}, {});
  return { path, type: (chain.at(-1) as Step).type.name, dimensions, rows };
}

// Where a path leads: each type on the way, from the type the path starts
// at, with the child that leads to it and its prefix in the parents' names;
// the dimensions of every type on the way; and the parents' states that
// decide where the child is, or that it is given, by their path.
export interface Placement {
  target: Type;
  steps: { type: Type; child?: Child; prefix: string }[];
  dimensions: string[];
  parents: { key: string; state: State }[];
  // Each received state on the way: the level it is received at, the level
  // of the type that provides it, and its key in the parents' names.
  received: { level: number; name: string; from: number; key: string }[];
  providerKey: (level: number, name: string) => string | undefined;
}

// Follows a path, "<Type>.<child>...": a refusal names the first part that
// is not a type or a child.
export function placement(file: ParseResult, path: string): Placement {
  const segments = path.split(".");
  const first = segments.findIndex((segment) => /^[a-z]/.test(segment));
  const rootName = segments.slice(0, first === -1 ? segments.length : first).join(".");
  const root = file.types.find(({ name }) => name === rootName);
  if (root === undefined) throw new Error(`no type ${rootName}`);
  const steps: Placement["steps"] = [{ type: root, prefix: "" }];
  for (const name of first === -1 ? [] : segments.slice(first)) {
    const { type: parent, prefix: previous } = steps.at(-1) as Placement["steps"][number];
    const child = parent.children.find((candidate) => candidate.name === name);
    if (child === undefined) {
      const children = parent.children.map((candidate) => candidate.name).join(", ");
      throw new Error(`${name} is not a child of ${parent.name} (${children})`);
    }
    const type = file.types.find(({ name }) => name === child.type.name) as Type;
    steps.push({ type, child, prefix: previous === "" ? name : `${previous}.${name}` });
  }
  const keyAt = (level: number, name: string) => {
    const prefix = steps[level]?.prefix ?? "";
    return prefix === "" ? name : `${prefix}.${name}`;
  };
  const parents: Placement["parents"] = [];
  const add = (key: string, state: State) => {
    if (!parents.some((parent) => parent.key === key)) parents.push({ key, state });
  };
  // Each received state, from the nearest type above that provides it.
  const received: Placement["received"] = [];
  steps.forEach(({ type }, level) => {
    for (const wanted of type.states.filter((state) => state.received)) {
      let from = level - 1;
      for (; from >= 0; from--) {
        const above = (steps[from] as Placement["steps"][number]).type;
        if (above.provides.some(({ name }) => name === wanted.name)) break;
      }
      if (from < 0) {
        throw new Error(
          `${wanted.name} is received by ${type.name}, but nothing above it provides it`,
        );
      }
      const above = (steps[from] as Placement["steps"][number]).type;
      const state = above.states.find(({ name, received: own }) => name === wanted.name && !own);
      if (state === undefined) continue;
      if (state.enum.name !== wanted.enum.name) {
        const a = (name: string) => (/^[AEIOU]/.test(name) ? "an" : "a");
        throw new Error(
          `${type.name} receives ${wanted.name} as ${a(wanted.enum.name)} ${wanted.enum.name}, but ${above.name} provides it as ${a(state.enum.name)} ${state.enum.name}`,
        );
      }
      const key = keyAt(from, wanted.name);
      received.push({ level, name: wanted.name, from, key });
      add(key, state);
    }
  });
  const providerKey = (level: number, name: string) =>
    received.find((entry) => entry.level === level && entry.name === name)?.key;
  steps.forEach(({ type }, level) => {
    const next = steps[level + 1]?.child;
    if (next === undefined) return;
    const deciding =
      next.when === undefined
        ? []
        : subjects(next.when)
            .map(({ name }) => name)
            .filter((name) => /^[a-z]/.test(name));
    const relevant = new Set([...deciding, ...(next.bindings ?? []).map(({ from }) => from.name)]);
    for (const name of relevant) {
      const state = type.states.find((candidate) => candidate.name === name);
      if (state === undefined || state.received) continue;
      add(keyAt(level, name), state);
    }
  });
  // A root's states are keyed by their own names, as the element's own are:
  // one of each with one name could not be told apart. A received state is
  // the provider's, so it may share it, and so may one bound straight from
  // the root's state of its name, since the two always agree.
  const last = steps.at(-1) as Placement["steps"][number];
  const target = last.type;
  const agrees = (name: string) =>
    steps.length === 2 &&
    (last.child?.bindings ?? []).some(
      ({ state, from, map }) => state.name === name && from.name === name && map === undefined,
    );
  const shadowed = target.states.find(
    ({ name, received: own }) => !own && !agrees(name) && parents.some(({ key }) => key === name),
  );
  if (shadowed !== undefined && target !== root) {
    throw new Error(
      `${target.name} has a state ${shadowed.name}, and so does ${root.name} above it; rename one, so that each can be told apart`,
    );
  }
  return {
    target,
    steps,
    dimensions: [...new Set(steps.flatMap(({ type }) => type.needs.map(({ name }) => name)))],
    parents,
    received,
    providerKey,
  };
}

// The file's profiles, those with the same values as one group, in the order
// the first of each comes.
function profileGroups(
  file: ParseResult,
): { profiles: string[]; values: Record<string, string> }[] {
  const groups = new Map<string, { profiles: string[]; values: Record<string, string> }>();
  for (const profile of profilesOf(file)) {
    const key = JSON.stringify(Object.entries(profile.values).sort(([a], [b]) => (a < b ? -1 : 1)));
    const group = groups.get(key);
    if (group !== undefined) group.profiles.push(profile.name);
    else groups.set(key, { profiles: [profile.name], values: { ...profile.values } });
  }
  return [...groups.values()];
}
