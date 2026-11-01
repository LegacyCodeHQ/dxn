import type { ParseResult, RecordDeclaration, Type } from "./ast.js";
import { childPath, type Diagnostic, Diagnostics } from "./diagnostic.js";
import { states as evaluate, inPlace, type Placement, placement } from "./evaluate.js";
import { type JsonNode, parseJson } from "./json.js";
import { among, article, Names } from "./names.js";
import { givenDimensions, profilesOf } from "./profiles.js";
import { penNode, scalar } from "./scalars.js";

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
  // What the file says about a path or a type does not change from one
  // stored record to the next: each is worked out once.
  const once = <Value>(work: (key: string) => Value) => {
    const known = new Map<string, Value>();
    return (key: string): Value => {
      if (!known.has(key)) known.set(key, work(key));
      return known.get(key) as Value;
    };
  };
  const placedAt = once((path) => placement(file, path));
  const inPlaceOf = once((path) => inPlace(file, path));
  const statesOf = once((type) => evaluate(file, type));
  const profileNames = profilesOf(file).map(({ name }) => name);
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
        // A path from any type: an element of a tree, or of a component, a
        // type another contains, on its own.
        place = placedAt(placed.value.value);
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
          profileNames,
          childPath(path, "profile"),
          member("profile")?.value,
        )
      : undefined;
    // The dimensions the profiles give, and so the ones to give here.
    const given = givenDimensions(file);
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
          // A state or a dimension the element gained since: the record is
          // outdated, not wrong.
          if (key === "parents") {
            diagnostics.report(
              "missing-field",
              `context.${key} is missing ${name}`,
              at,
              value.span.start,
            );
          } else {
            const had = key === "states" ? "had" : "needed";
            diagnostics.report(
              "outdated",
              `recorded before ${label} ${had} ${name}`,
              at,
              value.span.start,
              true,
            );
          }
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
    // the child, there; in one of its rows, when they are split by a state
    // another depends on.
    let rows: Record<string, string[]>[];
    let where = world;
    if (place !== undefined) {
      const settled = Object.entries(parents)
        .map(([name, value]) => `${name} = ${value}`)
        .join(", ");
      where = `${world} with ${settled}`;
      const there = inPlaceOf(label).rows.filter(
        (candidate) =>
          inWorld(candidate) &&
          Object.entries(parents).every(([name, value]) => candidate.parents[name] === value),
      );
      if (there.length === 0) {
        const parentsAt = member("parents")?.value;
        diagnostics.report(
          "unknown-value",
          `${label} is not there on ${where}`,
          childPath(path, "parents"),
          parentsAt?.span.start ?? node.span.start,
        );
        return;
      }
      rows = there.map(({ states }) => states);
    } else {
      rows = statesOf(owner.name)
        .rows.filter(inWorld)
        .map(({ states }) => states);
    }
    for (const { name, value, at, start } of pending) {
      const values = [...new Set(rows.flatMap((states) => states[name] ?? []))];
      const fitting = rows.filter((states) => states[name]?.includes(value) === true);
      if (fitting.length > 0) rows = fitting;
      else {
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
      checkActor(node, name, path);
    }
    // A derived field is not stored: its value follows from another's.
    const fields = record.fields
      .filter(({ derived }) => derived === undefined)
      .map((field) => field.name);
    for (const { key, value } of node.members) {
      if (withContext && (key.value === "context" || key.value === "actor")) continue;
      const at = childPath(path, key.value);
      const field = record.fields.find((candidate) => candidate.name === key.value);
      if (field?.derived !== undefined) {
        diagnostics.report(
          "derived-field",
          `${field.name} is derived from ${field.derived.on.name}; it is not stored`,
          at,
          key.span.start,
        );
        continue;
      }
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

  // Who recorded a stored record: one of the actors who record it.
  const checkActor = (node: JsonNode & { kind: "object" }, name: string, path: string) => {
    const member = node.members.find(({ key }) => key.value === "actor");
    const at = childPath(path, "actor");
    if (member === undefined) {
      diagnostics.report("missing-field", `${name} is missing actor`, path, node.span.start);
      return;
    }
    const { value } = member;
    if (value.kind !== "string") {
      wrong(value, at, "an actor's name (a string)");
      return;
    }
    const recording = file.actors.filter(({ records: recorded }) => recorded.name === name);
    if (recording.some(({ name: actor }) => actor === value.value)) return;
    const declared = file.actors.find(({ name: actor }) => actor === value.value);
    const message =
      declared === undefined
        ? `${JSON.stringify(value.value)} is not an actor who records ${name}${among(
            value.value,
            recording.map(({ name: actor }) => actor),
          )}`
        : `${declared.name} records ${declared.records.name}, not ${name}`;
    diagnostics.report("unknown-actor", message, at, value.span.start);
  };

  // A node of a design file: each of its fields, each of its type; node may
  // be left out.
  const checkPenNode = (node: JsonNode, path: string) => {
    if (node.kind !== "object") {
      wrong(node, path, "a PenNode (an object)");
      return;
    }
    const known = penNode.fields.map(({ name }) => name);
    for (const { key, value } of node.members) {
      const field = penNode.fields.find(({ name }) => name === key.value);
      const at = childPath(path, key.value);
      if (field === undefined) {
        diagnostics.report(
          "unknown-field",
          `PenNode has no field ${JSON.stringify(key.value)} (${known.join(", ")})`,
          at,
          key.span.start,
        );
      } else {
        checkValue(value, field.type, at);
      }
    }
    for (const { name, optional } of penNode.fields) {
      if (!optional && !node.members.some(({ key }) => key.value === name)) {
        diagnostics.report("missing-field", `PenNode is missing ${name}`, path, node.span.start);
      }
    }
  };

  // A field's value: a record, a scalar's string, or one of an enum's values.
  const checkValue = (node: JsonNode, type: string, path: string) => {
    if (names.kindOf(type) === "record") {
      checkRecord(node, type, path);
      return;
    }
    if (type === penNode.name) {
      checkPenNode(node, path);
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
