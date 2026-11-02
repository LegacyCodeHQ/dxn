import type { Child, Located, ParseResult, RecordDeclaration, Type } from "./ast.js";
import { conditionText, holds } from "./condition.js";
import { childPath, type Diagnostic, Diagnostics } from "./diagnostic.js";
import { states as evaluate, inPlace, type Placement, placement } from "./evaluate.js";
import { type JsonNode, parseJson } from "./json.js";
import { message, words } from "./message.js";
import { among, article, Names } from "./names.js";
import { givenDimensions, profilesOf } from "./profiles.js";
import { penNode, scalar } from "./scalars.js";

// The look a stored record is about: its element's type, and the value of
// each of its states and dimensions there.
interface Look {
  type: Type;
  values: Record<string, string>;
  named: string;
}

// How many instances of a component a drawing shows, as a message says it:
// "no Tab instance", "1 Tab instance", "3 Tab instances".
const instances = (count: number, name: string) =>
  message`${count === 0 ? words("no") : count} ${name} ${words(count <= 1 ? "instance" : "instances")}`;

// How a JSON value reads in a message.
const found: Record<JsonNode["kind"], string> = {
  object: "an object",
  array: "a list",
  string: "a string",
  number: "a number",
  boolean: "a boolean",
  null: "null",
};

// What a PenNode's drawing shows: the components it has an instance of, by
// name, each with how many; undefined where that is not known.
export type Drawn = (source: {
  file: string;
  frame: string;
  node?: string;
}) => Map<string, number> | undefined;

// Checks JSON data, a list of records, against a record of a file without
// problems: every field given, each of its type, and no others. Each problem
// has its line, column and JSON path. With a way to read drawings, a stored
// record's drawings must show its element's children as the model has them
// in its look.
export function validate(
  file: ParseResult,
  recordName: string,
  source: string,
  drawn?: Drawn,
): Diagnostic[] {
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
  const profileValues = profilesOf(file);
  const profileNames = profileValues.map(({ name }) => name);
  const records = new Map<string, RecordDeclaration>();
  for (const record of file.records)
    if (!records.has(record.name)) records.set(record.name, record);
  const wrong = (node: JsonNode, path: string, expected: string) =>
    diagnostics.error(
      "wrong-kind",
      `expected ${expected}, found ${found[node.kind]}`,
      path,
      node.span.start,
    );

  // A stored record's context: one combination of a type, as its type, its
  // profile when the file has profiles, the dimensions the type needs that
  // the profile does not give, and a value for every state that exists there.
  const checkContext = (node: JsonNode, path: string): Look | undefined => {
    if (node.kind !== "object") {
      wrong(node, path, "a context (an object)");
      return;
    }
    const member = (key: string) => node.members.find((candidate) => candidate.key.value === key);
    const typed = member("type");
    const placed = member("path");
    if (typed !== undefined && placed !== undefined) {
      diagnostics.error(
        "unknown-field",
        message`${"context"} has both ${"type"} and ${"path"}; give one`,
        childPath(path, "type"),
        typed.key.span.start,
      );
      return;
    }
    if (typed === undefined && placed === undefined) {
      diagnostics.error(
        "missing-field",
        message`${"context"} is missing ${"type"} or ${"path"}`,
        path,
        node.span.start,
      );
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
        diagnostics.error(
          "unknown-field",
          message`${"context"} has no field ${key.value} (${keys})`,
          childPath(path, key.value),
          key.span.start,
        );
      }
    }
    for (const key of keys) {
      if (member(key) === undefined) {
        diagnostics.error(
          "missing-field",
          message`${"context"} is missing ${key}`,
          path,
          node.span.start,
        );
      }
    }
    // A string among the choices, or a problem; the string when it is one.
    const choose = (
      key: string,
      wanted: string,
      choices: string[],
      at: string,
      value?: JsonNode,
    ) => {
      if (value === undefined) return undefined;
      if (value.kind !== "string") {
        wrong(value, at, `${wanted} (a string)`);
        return undefined;
      }
      if (!choices.includes(value.value)) {
        diagnostics.error(
          "unknown-value",
          message`${value.value} is not ${words(key)} (${choices})`,
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
        diagnostics.error(
          "unknown-value",
          message`${placed.value.value} is not a path: ${words((error as Error).message)}`,
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
        "a type",
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
          "a profile",
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
          diagnostics.error(
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
            diagnostics.error(
              "missing-field",
              message`${`context.${key}`} is missing ${name}`,
              at,
              value.span.start,
            );
          } else {
            const had = key === "states" ? "had" : "needed";
            diagnostics.warn(
              "outdated",
              message`recorded before ${label} ${words(had)} ${name}`,
              at,
              value.span.start,
            );
          }
          complete = false;
        }
      }
    };
    const has = expected.length > 0 ? message`${expected}` : "nothing";
    group(
      "dimensions",
      expected,
      (name) =>
        given.includes(name)
          ? message`${name} is given by the profile; ${"context.dimensions"} has ${words(has)}`
          : message`${label} does not need ${name}; ${"context.dimensions"} has ${words(has)}`,
      (name, value, at) => {
        const result = choose(
          message`a value of ${name}`,
          message`${words(article(name))} ${name}`,
          names.values(name) ?? [],
          at,
          value,
        );
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
        (name) => message`${name} does not decide where ${label} is (${all})`,
        (name, value, at) => {
          const state = deciding.find(({ key }) => key === name)?.state;
          const values = names.values(state?.enum.name ?? "") ?? [];
          const result = choose(
            message`a value of ${name}`,
            message`${words(article(name))} ${name}`,
            values,
            at,
            value,
          );
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
      (name) => message`${owner.name} has no state ${name} (${states})`,
      (name, value, at) => {
        const state = owner.states.find((candidate) => candidate.name === name);
        const values = names.values(state?.enum.name ?? "") ?? [];
        const result = choose(
          message`a value of ${name}`,
          message`${words(article(name))} ${name}`,
          values,
          at,
          value,
        );
        if (result !== undefined)
          pending.push({ name, value: result, at, start: value.span.start });
        return result !== undefined;
      },
    );
    if (!complete) return;
    const world = [
      ...(profile === undefined ? [] : [profile]),
      ...expected.map((name) => `${name} ${chosen[name]}`),
    ];
    const inWorld = (row: { profiles?: string[]; when: Record<string, string> }) =>
      (profile === undefined || row.profiles?.includes(profile) === true) &&
      expected.every((name) => row.when[name] === chosen[name]);
    // Each state value must exist in that combination: of the type, or of
    // the child, there; in one of its rows, when they are split by a state
    // another depends on.
    let rows: Record<string, string[]>[];
    let where = message`${world}`;
    if (place !== undefined) {
      const settled = Object.entries(parents).map(([name, value]) => `${name} = ${value}`);
      where = message`${world} with ${settled}`;
      const there = inPlaceOf(label).rows.filter(
        (candidate) =>
          inWorld(candidate) &&
          Object.entries(parents).every(([name, value]) => candidate.parents[name] === value),
      );
      if (there.length === 0) {
        const parentsAt = member("parents")?.value;
        diagnostics.error(
          "unknown-value",
          message`${label} is not there on ${words(where)}`,
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
    let sound = true;
    for (const { name, value, at, start } of pending) {
      const values = [...new Set(rows.flatMap((states) => states[name] ?? []))];
      const fitting = rows.filter((states) => states[name]?.includes(value) === true);
      if (fitting.length > 0) rows = fitting;
      else {
        sound = false;
        diagnostics.error(
          "unknown-value",
          message`${value} is not a value of ${name} on ${words(where)} (${values})`,
          at,
          start,
        );
      }
    }
    if (!sound) return;
    const fromProfile = profileValues.find(({ name }) => name === profile)?.values ?? {};
    const values: Record<string, string> = { ...fromProfile, ...chosen };
    for (const { name, value } of pending) values[name] = value;
    // The look, as a problem names it: its profile, dimensions and states.
    const named = [
      ...(profile === undefined ? [] : [message`on ${profile}`]),
      ...[
        ...expected.map((name) => [name, chosen[name]]),
        ...pending.map(({ name, value }) => [name, value]),
      ].map(([name, value]) => message`${`${name} = ${value}`}`),
    ].join(", ");
    return { type: owner, values, named: named === "" ? message`${owner.name}` : named };
  };

  // A stored record's drawings, each against its element's children in its
  // look: each child's type drawn as often as the model has it there, and no
  // other type of the model drawn.
  const checkDrawings = (
    node: JsonNode & { kind: "object" },
    look: Look,
    record: RecordDeclaration,
    path: string,
  ) => {
    if (drawn === undefined) return;
    for (const field of record.fields.filter(({ type }) => type.name === penNode.name)) {
      const member = node.members.find(({ key }) => key.value === field.name);
      if (member?.value.kind !== "object") continue;
      const text = (key: string) => {
        const found = (member.value as JsonNode & { kind: "object" }).members.find(
          (each) => each.key.value === key,
        )?.value;
        return found?.kind === "string" ? found.value : undefined;
      };
      const [drawing, frame, at] = [text("file"), text("frame"), text("node")];
      if (drawing === undefined || frame === undefined) continue;
      const shown = drawn(
        at === undefined ? { file: drawing, frame } : { file: drawing, frame, node: at },
      );
      if (shown === undefined) continue;
      const report = (message: string, element: Located) =>
        diagnostics.error(
          "drawing-mismatch",
          `${look.named}: ${message}`,
          childPath(path, field.name),
          member.value.span.start,
          { line: element.line, column: element.column },
        );
      checkShown(look, shown, report);
    }
  };

  // What a drawing shows against what the element has in its look, each
  // problem at the child it is about, or the type for one it does not have.
  const checkShown = (
    look: Look,
    shown: Map<string, number>,
    report: (message: string, element: Located) => void,
  ) => {
    const { type, values } = look;
    const short = (name: string) => {
      const declared = file.types.find((each) => each.name === name);
      return declared?.short ?? declared?.name ?? name;
    };
    const modeled = new Set(file.types.map((each) => each.short ?? each.name));
    const kinds = [...new Set(type.children.map((child) => short(child.type.name)))];
    for (const [name, count] of shown) {
      if (modeled.has(name) && !kinds.includes(name)) {
        report(
          message`the drawing shows ${words(instances(count, name))}, which ${type.name} does not have`,
          type,
        );
      }
    }
    const and = (names: string[]) =>
      names.length === 1
        ? message`${names[0]}`
        : message`${names.slice(0, -1)} and ${names.at(-1)}`;
    const isThere = (child: Child) =>
      child.when === undefined || holds(child.when, (name) => values[name]);
    for (const kind of kinds) {
      const children = type.children.filter((child) => short(child.type.name) === kind);
      const there = children.filter(isThere);
      // A single child is drawn once, a list one or more times, and a
      // member of a list of several any number of times, the list as a whole
      // checked after.
      const singles = there.filter(({ list, member }) => !list && member === undefined);
      const exact = singles.length;
      const lists = there.filter(({ list }) => list);
      const members = there.filter(({ member }) => member !== undefined);
      const count = shown.get(kind) ?? 0;
      if (
        lists.length > 0
          ? count >= exact + 1
          : members.length > 0
            ? count >= exact
            : count === exact
      )
        continue;
      const drew = `the drawing shows ${instances(count, kind)}`;
      const [first] = singles.length > 0 ? singles : there;
      if (first === undefined) {
        // Drawn where it is not there.
        const away = children[0] as (typeof children)[number];
        const when = away.when === undefined ? "" : conditionText(away.when);
        report(message`${words(drew)}, but ${away.name} is there only when ${when}`, away);
      } else if (lists.length > 0) {
        report(
          message`${words(drew)}, but ${words(and(there.map(({ name }) => name)))} is a list, one or more ${kind}`,
          lists[0] as Located,
        );
      } else if (exact === 1 && count > 1) {
        report(
          message`${words(drew)}, but ${first.name} is a single ${kind}; make it a list, ${`[${kind}]`}, or draw one`,
          first,
        );
      } else if (exact === 1) {
        report(message`${words(drew)}, but ${first.name} is a single ${kind}`, first);
      } else {
        report(
          `${drew}, but ${and(singles.map(({ name }) => name))} are ${instances(exact, kind)}`,
          first,
        );
      }
    }
    // A list of several has one row or more, of its members there: the rows
    // of their types beyond the single children of those types.
    for (const union of type.unions) {
      const there = union.members.filter(isThere);
      if (there.length === 0) continue;
      const kindsThere = [...new Set(there.map((member) => short(member.type.name)))];
      const rows = kindsThere.reduce((sum, kind) => {
        const singles = type.children.filter(
          (child) =>
            short(child.type.name) === kind &&
            !child.list &&
            child.member === undefined &&
            isThere(child),
        ).length;
        return sum + Math.max(0, (shown.get(kind) ?? 0) - singles);
      }, 0);
      if (rows > 0) continue;
      const none = message`no ${words(kindsThere.map((kind) => message`${kind}`).join(" or "))} instance`;
      const tags = there.map((member) => member.short ?? member.name);
      const of =
        tags.length === 1 ? message`${tags[0]}` : message`${tags.slice(0, -1)} or ${tags.at(-1)}`;
      report(
        message`the drawing shows ${words(none)}, but ${union.name} is a list, one or more of ${words(of)}`,
        union,
      );
    }
  };

  const checkRecord = (node: JsonNode, name: string, path: string, stored = false) => {
    const record = records.get(name) as RecordDeclaration;
    if (node.kind !== "object") {
      wrong(node, path, message`${words(article(name))} ${name} record (an object)`);
      return;
    }
    const withContext = stored && record.context;
    if (withContext) {
      const context = node.members.find(({ key }) => key.value === "context");
      if (context === undefined) {
        diagnostics.error(
          "missing-field",
          message`${name} is missing ${"context"}`,
          path,
          node.span.start,
        );
      } else {
        const look = checkContext(context.value, childPath(path, "context"));
        if (look !== undefined) checkDrawings(node, look, record, path);
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
        diagnostics.error(
          "derived-field",
          message`${field.name} is derived from ${field.derived.on.name}; it is not stored`,
          at,
          key.span.start,
        );
        continue;
      }
      if (field === undefined) {
        diagnostics.error(
          "unknown-field",
          message`${name} has no field ${key.value} (${fields})`,
          at,
          key.span.start,
        );
        continue;
      }
      checkValue(value, field.type.name, at);
    }
    for (const field of fields) {
      if (!node.members.some(({ key }) => key.value === field)) {
        diagnostics.error(
          "missing-field",
          message`${name} is missing ${field}`,
          path,
          node.span.start,
        );
      }
    }
  };

  // Who recorded a stored record: one of the actors who record it.
  const checkActor = (node: JsonNode & { kind: "object" }, name: string, path: string) => {
    const member = node.members.find(({ key }) => key.value === "actor");
    const at = childPath(path, "actor");
    if (member === undefined) {
      diagnostics.error(
        "missing-field",
        message`${name} is missing ${"actor"}`,
        path,
        node.span.start,
      );
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
    const said =
      declared === undefined
        ? message`${value.value} is not an actor who records ${name}${among(
            value.value,
            recording.map(({ name: actor }) => actor),
          )}`
        : message`${declared.name} records ${declared.records.name}, not ${name}`;
    diagnostics.error("unknown-actor", said, at, value.span.start);
  };

  // A node of a design file: each of its fields, each of its type; node may
  // be left out.
  const checkPenNode = (node: JsonNode, path: string) => {
    if (node.kind !== "object") {
      wrong(node, path, message`a ${penNode.name} (an object)`);
      return;
    }
    const known = penNode.fields.map(({ name }) => name);
    for (const { key, value } of node.members) {
      const field = penNode.fields.find(({ name }) => name === key.value);
      const at = childPath(path, key.value);
      if (field === undefined) {
        diagnostics.error(
          "unknown-field",
          message`${penNode.name} has no field ${key.value} (${known})`,
          at,
          key.span.start,
        );
      } else {
        checkValue(value, field.type, at);
      }
    }
    for (const { name, optional } of penNode.fields) {
      if (!optional && !node.members.some(({ key }) => key.value === name)) {
        diagnostics.error(
          "missing-field",
          message`${penNode.name} is missing ${name}`,
          path,
          node.span.start,
        );
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
        wrong(node, path, message`${words(article(type))} ${type} (a string)`);
      } else if (!builtIn.valid(node.value)) {
        diagnostics.error(
          "invalid-value",
          message`${words(JSON.stringify(node.value))} is not ${words(article(type))} ${type}: ${words(builtIn.definition)}`,
          path,
          node.span.start,
        );
      }
      return;
    }
    if (node.kind !== "string") {
      wrong(node, path, message`a value of ${type} (a string)`);
      return;
    }
    const values = names.values(type) ?? [];
    if (!values.includes(node.value)) {
      diagnostics.error(
        "unknown-value",
        message`${node.value} is not a value of ${type} (${values})`,
        path,
        node.span.start,
      );
    }
  };

  const root = parsed.root;
  if (root.kind !== "array") {
    wrong(root, "$", message`a list of ${recordName} records`);
  } else {
    root.elements.forEach((element, index) => {
      checkRecord(element, recordName, `$[${index}]`, true);
    });
  }
  return diagnostics.items.sort((a, b) => a.line - b.line || a.column - b.column);
}
