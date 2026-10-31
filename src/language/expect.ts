import type { Expectation, ParseResult } from "./ast.js";
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
  const keys = [...expectation.when, ...expectation.values];
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
  const has = (element: string, key: string) => {
    const place = placement(file, element);
    if (key === "profile") return profiles.length > 0;
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
  const matches = (combination: Combination, pairs: Expectation["when"]) =>
    pairs.every(({ key, value }) => valueAt(combination, key.name) === value.name);
  // Where a combination is: "<path> on <profile>, <Dimension> <value> with
  // <parent> = <value>".
  const where = (element: string, combination: Combination) => {
    const world = [
      ...(combination.profiles === undefined ? [] : [combination.profiles[0] as string]),
      ...Object.entries(combination.dimensions).map(([name, value]) => `${name} ${value}`),
    ].join(", ");
    const parents = Object.entries(combination.parents)
      .map(([name, value]) => `${name} = ${value}`)
      .join(", ");
    return `${element}${world === "" ? "" : ` on ${world}`}${parents === "" ? "" : ` with ${parents}`}`;
  };
  let picked = 0;
  for (const element of applicable) {
    const chosen = expand(file, element, given).filter((combination) =>
      matches(combination, expectation.when),
    );
    picked += chosen.length;
    if (expectation.assertion === "then") {
      for (const combination of chosen) {
        const wrong = expectation.values.find(
          ({ key, value }) => valueAt(combination, key.name) !== value.name,
        );
        if (wrong !== undefined) {
          return failed(
            `${where(element, combination)} has ${wrong.key.name} = ${valueAt(combination, wrong.key.name)}`,
          );
        }
      }
    } else if (expectation.assertion === "some") {
      if (!chosen.some((combination) => matches(combination, expectation.values))) {
        const condition = expectation.when
          .map(({ key, value }) =>
            key.name === "profile" ? `on ${value.name}` : `with ${key.name} = ${value.name}`,
          )
          .join(" ");
        const wanted = expectation.values
          .map(({ key, value }) => `${key.name} = ${value.name}`)
          .join(", ");
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
