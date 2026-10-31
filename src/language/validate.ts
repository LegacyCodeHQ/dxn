import { childPath, type Diagnostic, Diagnostics } from "../compiler/diagnostic.js";
import { type JsonNode, parseJson } from "../compiler/json.js";
import type { ParseResult, RecordDeclaration, Type } from "./ast.js";
import { states as evaluate, inPlace, type Placement, placement } from "./evaluate.js";
import { article, Names } from "./names.js";
import { profilesOf } from "./profiles.js";
import { scalar } from "./scalars.js";

// How a JSON value reads in a message.
const found: Record<JsonNode["kind"], string> = {
  object: "an object",
  array: "a list",
  string: "a string",
  number: "a number",
  boolean: "a boolean",
  null: "null",
};

// Checks JSON data, a list of records, against a record of a file without
// problems: every field given, each of its type, and no others. Each problem
// has its line, column and JSON path.
export function validate(file: ParseResult, recordName: string, source: string): Diagnostic[] {
  if (file.diagnostics.some(({ severity }) => severity === "error")) {
    throw new Error("cannot validate against a file with problems");
  }
  const names = new Names(file);
  if (names.kindOf(recordName) !== "record") throw new Error(names.not(recordName, "record"));
  const parsed = parseJson(source);
  if (parsed.root === undefined || parsed.diagnostics.length > 0) return parsed.diagnostics;
  const diagnostics = new Diagnostics(source);
  const records = new Map<string, RecordDeclaration>();
  for (const record of file.records)
    if (!records.has(record.name)) records.set(record.name, record);
  const wrong = (node: JsonNode, path: string, expected: string) =>
    diagnostics.report(
      "wrong-kind",
      `expected ${expected}, found ${found[node.kind]}`,
      path,
      node.span.start,
    );

  // A stored record's context: one combination of a type, as its type, its
  // profile when the file has profiles, the dimensions the type needs that
  // the profile does not give, and a value for every state that exists there.
  const checkContext = (node: JsonNode, path: string) => {
    if (node.kind !== "object") {
      wrong(node, path, "a context (an object)");
      return;
    }
    const member = (key: string) => node.members.find((candidate) => candidate.key.value === key);
    const typed = member("type");
    const placed = member("path");
    if (typed !== undefined && placed !== undefined) {
      diagnostics.report(
        "unknown-field",
        "context has both type and path; give one",
        childPath(path, "type"),
        typed.key.span.start,
      );
      return;
    }
    if (typed === undefined && placed === undefined) {
      diagnostics.report("missing-field", "context is missing type or path", path, node.span.start);
      return;
    }
    const profiled = file.profiles.length > 0;
    const keys = [
      placed === undefined ? "type" : "path",
      ...(profiled ? ["profile"] : []),
      "dimensions",
      ...(placed === undefined ? [] : ["parents"]),
      "states",
    ];
    for (const { key } of node.members) {
      if (!keys.includes(key.value)) {
        diagnostics.report(
          "unknown-field",
          `context has no field ${JSON.stringify(key.value)} (${keys.join(", ")})`,
          childPath(path, key.value),
          key.span.start,
        );
      }
    }
    for (const key of keys) {
      if (member(key) === undefined) {
        diagnostics.report("missing-field", `context is missing ${key}`, path, node.span.start);
      }
    }
    // A string among the choices, or a problem; the string when it is one.
    const choose = (key: string, of: string, choices: string[], at: string, value?: JsonNode) => {
      if (value === undefined) return undefined;
      if (value.kind !== "string") {
        wrong(value, at, `${article(of)} ${of} (a string)`);
        return undefined;
      }
      if (!choices.includes(value.value)) {
        diagnostics.report(
          "unknown-value",
          `${JSON.stringify(value.value)} is not ${key} (${choices.join(", ")})`,
          at,
          value.span.start,
        );
        return undefined;
      }
      return value.value;
    };
    // What the context is about: a type on its own, or a child in place, by
    // its path; and the dimensions of every type that takes part.
    let type: Type | undefined;
    let place: Placement | undefined;
    let label = "";
    if (placed !== undefined) {
      const at = childPath(path, "path");
      if (placed.value.kind !== "string") {
        wrong(placed.value, at, "a path (a string)");
        return;
      }
      try {
        place = placement(file, placed.value.value);
      } catch (error) {
        diagnostics.report(
          "unknown-value",
          `${JSON.stringify(placed.value.value)} is not a path: ${(error as Error).message}`,
          at,
          placed.value.span.start,
        );
        return;
      }
      type = place.target;
      label = placed.value.value;
    } else {
      const typeName = choose(
        "a type",
        "type",
        file.types.map(({ name }) => name),
        childPath(path, "type"),
        typed?.value,
      );
      type = file.types.find(({ name }) => name === typeName);
      if (type === undefined) return;
      label = type.name;
    }
    const needs = place?.dimensions ?? type.needs.map(({ name }) => name);
    const profile = profiled
      ? choose(
          "a profile",
          "profile",
          profilesOf(file).map(({ name }) => name),
          childPath(path, "profile"),
          member("profile")?.value,
        )
      : undefined;
    // The dimensions the profiles give, and so the ones to give here.
    const environment = file.environments.find(
      ({ name }) => name === file.profiles[0]?.environment.name,
    );
    const given = profiled ? (environment?.dimensions.map(({ name }) => name) ?? []) : [];
    const expected = needs.filter((name) => !given.includes(name));
    const chosen: Record<string, string> = {};
    const parents: Record<string, string> = {};
    let complete = !profiled || profile !== undefined;
    const group = (
      key: "dimensions" | "parents" | "states",
      names: string[],
      unknown: (name: string) => string,
      check: (name: string, value: JsonNode, at: string) => boolean,
    ) => {
      const value = member(key)?.value;
      const at = childPath(path, key);
      if (value === undefined) {
        complete = false;
        return;
      }
      if (value.kind !== "object") {
        wrong(value, at, "an object");
        complete = false;
        return;
      }
      for (const entry of value.members) {
        const entryAt = childPath(at, entry.key.value);
        if (!names.includes(entry.key.value)) {
          diagnostics.report(
            "unknown-field",
            unknown(entry.key.value),
            entryAt,
            entry.key.span.start,
          );
        } else if (!check(entry.key.value, entry.value, entryAt)) {
          complete = false;
        }
      }
      for (const name of names) {
        if (!value.members.some((entry) => entry.key.value === name)) {
          diagnostics.report(
            "missing-field",
            `context.${key} is missing ${name}`,
            at,
            value.span.start,
          );
          complete = false;
        }
      }
    };
    const has = expected.length > 0 ? expected.join(", ") : "nothing";
    group(
      "dimensions",
      expected,
      (name) =>
        given.includes(name)
          ? `${name} is given by the profile; context.dimensions has ${has}`
          : `${label} does not need ${name}; context.dimensions has ${has}`,
      (name, value, at) => {
        const result = choose(`a value of ${name}`, name, names.values(name) ?? [], at, value);
        if (result !== undefined) chosen[name] = result;
        return result !== undefined;
      },
    );
    if (place !== undefined) {
      const deciding = place.parents;
      const all = deciding.map(({ key }) => key);
      group(
        "parents",
        all,
        (name) => `${name} does not decide where ${label} is (${all.join(", ")})`,
        (name, value, at) => {
          const state = deciding.find(({ key }) => key === name)?.state;
          const values = names.values(state?.enum.name ?? "") ?? [];
          const result = choose(`a value of ${name}`, name, values, at, value);
          if (result !== undefined) parents[name] = result;
          return result !== undefined;
        },
      );
    }
    const states = type.states.map(({ name }) => name);
    const pending: { name: string; value: string; at: string; start: number }[] = [];
    const owner = type;
    group(
      "states",
      states,
      (name) => `${owner.name} has no state ${JSON.stringify(name)} (${states.join(", ")})`,
      (name, value, at) => {
        const state = owner.states.find((candidate) => candidate.name === name);
        const values = names.values(state?.enum.name ?? "") ?? [];
        const result = choose(`a value of ${name}`, name, values, at, value);
        if (result !== undefined)
          pending.push({ name, value: result, at, start: value.span.start });
        return result !== undefined;
      },
    );
    if (!complete) return;
    const world = [
      ...(profile === undefined ? [] : [profile]),
      ...expected.map((name) => `${name} ${chosen[name]}`),
    ].join(", ");
    const inWorld = (row: { profiles?: string[]; when: Record<string, string> }) =>
      (profile === undefined || row.profiles?.includes(profile) === true) &&
      expected.every((name) => row.when[name] === chosen[name]);
    // Each state value must exist in that combination: of the type, or of
    // the child, there.
    let available: Record<string, string[]> | undefined;
    let where = world;
    if (place !== undefined) {
      const settled = Object.entries(parents)
        .map(([name, value]) => `${name} = ${value}`)
        .join(", ");
      where = `${world} with ${settled}`;
      const row = inPlace(file, label).rows.find(
        (candidate) =>
          inWorld(candidate) &&
          Object.entries(parents).every(([name, value]) => candidate.parents[name] === value),
      );
      if (row === undefined) {
        const parentsAt = member("parents")?.value;
        diagnostics.report(
          "unknown-value",
          `${label} is not there on ${where}`,
          childPath(path, "parents"),
          parentsAt?.span.start ?? node.span.start,
        );
        return;
      }
      available = row.states;
    } else {
      available = evaluate(file, owner.name).rows.find(inWorld)?.states;
    }
    for (const { name, value, at, start } of pending) {
      const values = available?.[name] ?? [];
      if (!values.includes(value)) {
        diagnostics.report(
          "unknown-value",
          `${JSON.stringify(value)} is not a value of ${name} on ${where} (${values.join(", ")})`,
          at,
          start,
        );
      }
    }
  };

  const checkRecord = (node: JsonNode, name: string, path: string, stored = false) => {
    const record = records.get(name) as RecordDeclaration;
    if (node.kind !== "object") {
      wrong(node, path, `${article(name)} ${name} record (an object)`);
      return;
    }
    const withContext = stored && record.context;
    if (withContext) {
      const context = node.members.find(({ key }) => key.value === "context");
      if (context === undefined) {
        diagnostics.report("missing-field", `${name} is missing context`, path, node.span.start);
      } else {
        checkContext(context.value, childPath(path, "context"));
      }
    }
    const fields = record.fields.map((field) => field.name);
    for (const { key, value } of node.members) {
      if (withContext && key.value === "context") continue;
      const at = childPath(path, key.value);
      const field = record.fields.find((candidate) => candidate.name === key.value);
      if (field === undefined) {
        diagnostics.report(
          "unknown-field",
          `${name} has no field ${JSON.stringify(key.value)} (${fields.join(", ")})`,
          at,
          key.span.start,
        );
        continue;
      }
      checkValue(value, field.type.name, at);
    }
    for (const field of fields) {
      if (!node.members.some(({ key }) => key.value === field)) {
        diagnostics.report("missing-field", `${name} is missing ${field}`, path, node.span.start);
      }
    }
  };

  // A field's value: a record, a scalar's string, or one of an enum's values.
  const checkValue = (node: JsonNode, type: string, path: string) => {
    if (names.kindOf(type) === "record") {
      checkRecord(node, type, path);
      return;
    }
    const builtIn = scalar(type);
    if (builtIn !== undefined) {
      if (node.kind !== "string") {
        wrong(node, path, `${article(type)} ${type} (a string)`);
      } else if (!builtIn.valid(node.value)) {
        diagnostics.report(
          "invalid-value",
          `${JSON.stringify(node.value)} is not ${article(type)} ${type}: ${builtIn.definition}`,
          path,
          node.span.start,
        );
      }
      return;
    }
    if (node.kind !== "string") {
      wrong(node, path, `a value of ${type} (a string)`);
      return;
    }
    const values = names.values(type) ?? [];
    if (!values.includes(node.value)) {
      diagnostics.report(
        "unknown-value",
        `${JSON.stringify(node.value)} is not a value of ${type} (${values.join(", ")})`,
        path,
        node.span.start,
      );
    }
  };

  const root = parsed.root;
  if (root.kind !== "array") {
    wrong(root, "$", `a list of ${recordName} records`);
  } else {
    root.elements.forEach((element, index) => {
      checkRecord(element, recordName, `$[${index}]`, true);
    });
  }
  return diagnostics.items.sort((a, b) => a.line - b.line || a.column - b.column);
}
