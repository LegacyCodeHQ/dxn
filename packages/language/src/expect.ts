import type { Child, Expectation, ParseResult, Trigger, Type } from "./ast.js";
import { eventText } from "./check.js";
import { holds } from "./condition.js";
import { placement } from "./evaluate.js";
import { profilesOf } from "./profiles.js";
import { type Combination, expand, treePaths } from "./status.js";

// Checks each expectation against the tree in place: its element, or it and
// every element below it that has every key it names; the combinations its
// when picks; and its assertion on them. A rule that picks nothing would
// always pass, so it is reported too. The file must have no other problems.
export function expectations(file: ParseResult): void {
  const profiles = profilesOf(file);
  const environment = file.environments.find(
    ({ name }) => name === file.profiles[0]?.environment.name,
  );
  const given = environment?.dimensions.map(({ name }) => name) ?? [];
  // All are evaluated before any failure is recorded: a recorded one is a
  // problem, and a file with problems cannot be evaluated.
  const failures = file.expectations.map((expectation) => ({
    expectation,
    failure: checkOne(file, expectation, given, profiles),
  }));
  for (const { expectation, failure } of failures) {
    if (failure === undefined) continue;
    file.diagnostics.push({
      severity: "error",
      code: failure.code,
      message: `${expectation.title}${failure.code === "expectation-empty" ? " tests nothing" : ""}: ${failure.message}`,
      line: expectation.line,
      column: expectation.column,
    });
  }
}

type Failure = { code: "expectation-failed" | "expectation-empty"; message: string };

function checkOne(
  file: ParseResult,
  expectation: Expectation,
  given: string[],
  profiles: ReturnType<typeof profilesOf>,
): Failure | undefined {
  const empty = (message: string): Failure => ({ code: "expectation-empty", message });
  const failed = (message: string): Failure => ({ code: "expectation-failed", message });
  const path = expectation.path.name;
  try {
    placement(file, path);
  } catch (error) {
    return empty((error as Error).message);
  }
  const on = expectation.on;
  const values = expectation.values;
  const keys = [...expectation.when, ...values];
  for (const { key, value } of keys) {
    if (key.name === "profile" && !profiles.some(({ name }) => name === value.name)) {
      return empty(
        `${JSON.stringify(value.name)} is not a profile (${profiles.map(({ name }) => name).join(", ")})`,
      );
    }
  }
  // The elements: the path, and with "and below" every element under it.
  const elements = treePaths(file).filter(
    (candidate) => candidate === path || (expectation.below && candidate.startsWith(`${path}.`)),
  );
  if (elements.length === 0)
    return empty(`${path} is not in a tree from a type that nothing contains`);
  // Every element below must be placeable too: one that is not, such as one
  // receiving a state nothing above it provides, cannot be evaluated.
  for (const element of elements) {
    try {
      placement(file, element);
    } catch (error) {
      return empty(`${element}: ${(error as Error).message}`);
    }
  }
  // A key's value in a combination: the profile, a dimension, a parent's
  // state or one of the element's own.
  const valueAt = (combination: Combination, key: string): string | undefined => {
    if (key === "profile") return combination.profiles?.[0];
    if (/^[A-Z]/.test(key)) {
      const profile = profiles.find(({ name }) => name === combination.profiles?.[0]);
      return combination.dimensions[key] ?? profile?.values[key];
    }
    return combination.parents[key] ?? combination.states[key];
  };
  // A child's state, by its path from the element, "<child>….<state>": its
  // state, which only an event's changes say anything about.
  const childState = (element: string, key: string) => {
    const parts = key.split(".");
    if (parts.length < 2) return undefined;
    const at = childTypeAt(file, placement(file, element).target, parts.slice(0, -1));
    return at?.states.find(({ name }) => name === parts.at(-1));
  };
  const has = (element: string, key: string) => {
    const place = placement(file, element);
    if (key === "profile") return profiles.length > 0;
    if (on !== undefined && childState(element, key) !== undefined) return true;
    if (/^[A-Z]/.test(key)) return place.dimensions.includes(key);
    return (
      place.parents.some((parent) => parent.key === key) ||
      place.target.states.some(({ name }) => name === key)
    );
  };
  const applicable = elements.filter((element) => keys.every(({ key }) => has(element, key.name)));
  if (applicable.length === 0) {
    const missing = keys.find(({ key }) => !elements.some((element) => has(element, key.name)));
    return empty(`no element in ${path} has ${missing?.key.name ?? "every key it names"}`);
  }
  // A profile is any of a row's: profiles with the same values share one.
  // Each value must be one its key can have: a mistyped one would pick or
  // assert nothing.
  const valuesOf = (element: string, key: string): string[] => {
    if (/^[A-Z]/.test(key)) {
      return file.dimensions.find(({ name }) => name === key)?.values.map(({ name }) => name) ?? [];
    }
    const place = placement(file, element);
    const state =
      place.parents.find((parent) => parent.key === key)?.state ??
      place.target.states.find(({ name }) => name === key) ??
      childState(element, key);
    return (
      file.enums.find(({ name }) => name === state?.enum.name)?.values.map(({ name }) => name) ?? []
    );
  };
  for (const { key, value } of keys) {
    if (key.name === "profile") continue;
    const values = valuesOf(applicable[0] as string, key.name);
    if (!values.includes(value.name)) {
      return empty(
        `${JSON.stringify(value.name)} is not a value of ${key.name} (${values.join(", ")})`,
      );
    }
  }
  const matches = (combination: Combination, pairs: Expectation["when"]) =>
    pairs.every(({ key, value }) =>
      key.name === "profile"
        ? (combination.profiles ?? []).includes(value.name)
        : valueAt(combination, key.name) === value.name,
    );
  const named = expectation.when.find(({ key }) => key.name === "profile")?.value.name;
  // Where a combination is: "<path> on <profile>, <Dimension> <value> with
  // <parent> = <value>".
  const where = (element: string, combination: Combination) => {
    const world = [
      ...(combination.profiles === undefined
        ? []
        : [
            named !== undefined && combination.profiles.includes(named)
              ? named
              : (combination.profiles[0] as string),
          ]),
      ...Object.entries(combination.dimensions).map(([name, value]) => `${name} ${value}`),
    ].join(", ");
    const parents = Object.entries(combination.parents)
      .map(([name, value]) => `${name} = ${value}`)
      .join(", ");
    return `${element}${world === "" ? "" : ` on ${world}`}${parents === "" ? "" : ` with ${parents}`}`;
  };
  // After the event: the element's own changes its trigger makes in the
  // combination applied, and what it changes in its children.
  const after = (element: string, combination: Combination) => {
    if (on === undefined) return { combination, children: {} };
    const event = eventText(on);
    const type = placement(file, element).target;
    // The changes of the element's own a trigger makes here: a named action
    // in its from value, a change in place where its state is not yet its
    // value.
    const applied = (candidate: Trigger) =>
      candidate.does.flatMap((effect) => {
        if (effect.kind === "change") {
          return combination.states[effect.state.name] === effect.to.name
            ? []
            : [{ state: effect.state, to: effect.to }];
        }
        const action = type.actions.find(({ name }) => name.name === effect.name.name);
        return action !== undefined && combination.states[action.state.name] === action.from.name
          ? [{ state: action.state, to: action.to }]
          : [];
      });
    const trigger: Trigger | undefined = type.triggers.find((candidate) => {
      if (eventText(candidate.event) !== event) return false;
      // A trigger with a condition fires only where it holds.
      if (
        candidate.when !== undefined &&
        !holds(candidate.when, (name) => valueAt(combination, name))
      ) {
        return false;
      }
      return applied(candidate).length > 0;
    });
    const action = trigger === undefined ? undefined : applied(trigger)[0];
    // Where nothing fires, the element stays as it was. A rule that some
    // combination matches looks for it among the others; one that every
    // combination does must hold of it unchanged.
    const unchanged =
      expectation.assertion !== "then" ||
      values.every(({ key, value }) => valueAt(combination, key.name) === value.name);
    if ((trigger === undefined || action === undefined) && unchanged) {
      return { combination, children: {} };
    }
    if (trigger === undefined || action === undefined) {
      const condition = expectation.when
        .map(({ key, value }) => `${key.name} = ${value.name}`)
        .join(", ");
      return failed(
        `nothing happens on ${event} to ${element}${condition === "" ? "" : ` when ${condition}`}`,
      );
    }
    // Every change of the element's own that applies here.
    const states = { ...combination.states };
    for (const { state, to } of trigger === undefined ? [] : applied(trigger)) {
      states[state.name] = to.name;
    }
    const changed = { ...combination, states };
    // The change must lead to a combination the element can have there.
    if (!expand(file, element, given).some((candidate) => same(candidate, changed))) {
      return failed(
        `on ${event}, ${where(element, combination)} would have ${action.state.name} = ${action.to.name}, which it cannot have there`,
      );
    }
    // What it changes in a child, by the child's action: "<child>.<state>".
    const children: Record<string, string> = {};
    for (const effect of trigger.does) {
      if (effect.kind !== "action" || !effect.name.name.includes(".")) continue;
      const parts = effect.name.name.split(".");
      const owner = parts.slice(0, -1).join(".");
      const at = childTypeAt(file, type, parts.slice(0, -1));
      const done = at?.actions.find(({ name }) => name.name === parts.at(-1));
      if (done !== undefined) children[`${owner}.${done.state.name}`] = done.to.name;
    }
    return { combination: changed, children };
  };
  // Two combinations alike in everything: profiles, dimensions, parents and
  // states.
  const same = (a: Combination, b: Combination) => JSON.stringify(a) === JSON.stringify(b);
  let picked = 0;
  for (const element of applicable) {
    const before = expand(file, element, given).filter((combination) =>
      matches(combination, expectation.when),
    );
    picked += before.length;
    const chosen: Combination[] = [];
    const inChildren: Record<string, string>[] = [];
    for (const combination of before) {
      const changed = after(element, combination);
      if ("code" in changed) return changed;
      chosen.push(changed.combination);
      inChildren.push(changed.children);
    }
    // A child's state after the event is what the event changed it to.
    const ofChild = (key: string) =>
      valueAt(chosen[0] ?? ({} as Combination), key) === undefined &&
      childState(element, key) !== undefined;
    if (expectation.assertion === "then" && on !== undefined) {
      for (const changed of inChildren) {
        for (const { key, value } of values.filter(({ key }) => ofChild(key.name))) {
          const became = changed[key.name];
          if (became === undefined) {
            return failed(`on ${eventText(on)}, ${key.name} does not change`);
          }
          if (became !== value.name) {
            return failed(`on ${eventText(on)}, ${key.name} becomes ${became}, not ${value.name}`);
          }
        }
      }
    }
    if (expectation.assertion === "then") {
      for (const combination of chosen) {
        const wrong = values.find(
          ({ key, value }) => !ofChild(key.name) && valueAt(combination, key.name) !== value.name,
        );
        if (wrong !== undefined) {
          return failed(
            `${where(element, combination)} has ${wrong.key.name} = ${valueAt(combination, wrong.key.name)}`,
          );
        }
      }
    } else if (expectation.assertion === "some") {
      if (!chosen.some((combination) => matches(combination, values))) {
        const condition = expectation.when
          .map(({ key, value }) =>
            key.name === "profile" ? `on ${value.name}` : `with ${key.name} = ${value.name}`,
          )
          .join(" ");
        const wanted = values.map(({ key, value }) => `${key.name} = ${value.name}`).join(", ");
        return failed(
          `no combination of ${element}${condition === "" ? "" : ` ${condition}`} has ${wanted}`,
        );
      }
    } else {
      const there = chosen[0];
      if (there !== undefined) {
        const description = where(element, there);
        return failed(`${element} is there${description.slice(element.length)}`);
      }
    }
  }
  if (picked === 0 && expectation.assertion !== "absent") {
    return empty(`no combination of ${path} has what its when names`);
  }
  return undefined;
}

// The type of a child, by its path from a type.
function childTypeAt(file: ParseResult, type: Type, path: string[]): Type | undefined {
  let at: Type | undefined = type;
  for (const part of path) {
    const child: Child | undefined = at?.children.find(({ name }) => name === part);
    at = file.types.find(({ name }) => name === child?.type.name);
  }
  return at;
}
