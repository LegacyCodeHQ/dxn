import type { Declaration, ParseResult, Type } from "./ast.js";
import { type Placement, placement } from "./evaluate.js";
import { parse } from "./parse.js";
import { scalars } from "./scalars.js";
import { treePaths } from "./status.js";

export type CompletionKind =
  | "keyword"
  | "enum"
  | "dimension"
  | "type"
  | "record"
  | "scalar"
  | "environment"
  | "profile"
  | "value"
  | "state"
  | "event"
  | "action"
  | "child";

export interface Completion {
  label: string;
  kind: CompletionKind;
}

// What is open around a place in a file, innermost last: a type's body, by
// its full name; a record's; a profile's or a modifier's values, with the
// profile's environment; a child's bindings, with the child's type; or
// anything else in braces.
type Open =
  | { kind: "type"; name: string }
  | { kind: "record"; name: string }
  | { kind: "assignments"; environment?: string }
  | { kind: "bindings"; type: string }
  | { kind: "expect"; line: number }
  | { kind: "other" };

const topKeywords = [
  "dimension",
  "enum",
  "type",
  "record",
  "environment",
  "profile",
  "modifier",
  "expect",
];
const typeKeywords = ["state", "event", "action", "on", "has", "alike", "provides", "enum", "type"];

// What can be written at a line and a column of a source, both from one: the
// names that fit there, by what the statement it is in has so far. The editor
// narrows them by what is typed of the name.
export function completions(source: string, line: number, column: number): Completion[] {
  const file = parse(source);
  const lines = source.split("\n");
  const before = (lines[line - 1] ?? "").slice(0, column - 1);
  // The statement so far, without the name being typed.
  const statement = before.replace(/[A-Za-z0-9-]*$/, "").trimStart();
  const open = opened(file, lines, line, column);
  const inside = open.at(-1);
  const type = [...open].reverse().find((item) => item.kind === "type") as
    | { kind: "type"; name: string }
    | undefined;
  const typed = type === undefined ? undefined : typeNamed(file, type.name);
  const names = (labels: string[], kind: CompletionKind) =>
    [...new Set(labels)].map((label) => ({ label, kind }));
  const dimensions = () =>
    names(
      file.dimensions.map(({ name }) => name),
      "dimension",
    );
  // Leaves out the names already written in a list.
  const unwritten = (completions: Completion[], list: string) => {
    const written = new Set(list.split(/[^A-Za-z0-9-]+/));
    return completions.filter(({ label }) => !written.has(label));
  };
  const values = (subject: string) => names(valuesOf(file, typed, subject, inside), "value");

  if (inside?.kind === "expect") return inExpectation(file, lines, inside.line, statement);

  // Along a path into children: what the child at its end has.
  const path = statement.match(/([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)\.$/);
  if (path !== null && typed !== undefined) {
    const end = along(file, typed, (path[1] as string).split("."));
    if (end === undefined) return [];
    const children = names(
      end.children.map(({ name }) => name),
      "child",
    );
    if (/^on\s+[^:]*$/.test(statement)) {
      return [
        ...names(
          end.events.map(({ name }) => name),
          "event",
        ),
        ...children,
      ];
    }
    return [
      ...names(
        end.actions.map(({ name }) => name.name),
        "action",
      ),
      ...children,
    ];
  }

  // A type's header: what it needs, and the enum of what it receives.
  const needed = statement.match(/^type\s+[A-Za-z0-9.-]+\s+needs\s+((?:[A-Za-z0-9-]+\s*,\s*)*)$/);
  if (needed !== null) return unwritten(dimensions(), needed[1] as string);
  const header = statement.match(/^type\s+([A-Za-z0-9-]+).*\breceives\b.*:\s*$/);
  if (header !== null) {
    const name = type === undefined ? (header[1] as string) : `${type.name}.${header[1]}`;
    return names(visible(file, name, file.enums), "enum");
  }
  // Declarations at the top: an environment's dimensions, a profile's
  // environment, and the profiles a modifier fits.
  const product = statement.match(
    /^environment\s+[A-Za-z0-9-]+\s*=\s*((?:[A-Za-z0-9-]+\s+x\s+)*)$/,
  );
  if (product !== null) return unwritten(dimensions(), product[1] as string);
  if (/^profile\s+[A-Za-z0-9-]+\s*:\s*$/.test(statement)) {
    return names(
      file.environments.map(({ name }) => name),
      "environment",
    );
  }
  const fits = statement.match(/^modifier\s+[A-Za-z0-9-]+\s+on\s+((?:[A-Za-z0-9-]+\s*,\s*)*)$/);
  if (fits !== null) {
    return unwritten(
      names(
        file.profiles.map(({ name }) => name),
        "profile",
      ),
      fits[1] as string,
    );
  }

  // A value: after a subject and "=", in "in (...)", or after "->".
  const compared = statement.match(/([A-Za-z0-9-]+)\s*=\s*$/);
  if (compared !== null) {
    // A binding sets a child's state from one of the type's own.
    if (inside?.kind === "bindings" && typed !== undefined && !/when\s/.test(statement)) {
      return names(
        typed.states.map(({ name }) => name),
        "state",
      );
    }
    return values(compared[1] as string);
  }
  const listed = statement.match(/([A-Za-z0-9-]+)\s+in\s*\(([^)]*,)?\s*$/);
  if (listed !== null) return unwritten(values(listed[1] as string), listed[2] ?? "");
  const action = statement.match(
    /^action\s+[A-Za-z0-9-]+\s*:\s*(?:([A-Za-z0-9-]+)\s+(?:[A-Za-z0-9-]+\s*->\s*)?)?$/,
  );
  if (action !== null && typed !== undefined) {
    if (action[1] === undefined)
      return names(
        typed.states.map(({ name }) => name),
        "state",
      );
    return values(action[1]);
  }
  const changed = statement.match(/([A-Za-z0-9-]+)\s*->\s*$/);
  if (changed !== null && /^on\s/.test(statement)) return values(changed[1] as string);

  // Inside a record: a field's type.
  if (inside?.kind === "record" && /^[A-Za-z0-9-]+\s*:\s*$/.test(statement)) {
    return [
      ...names(
        file.enums.filter(({ scope }) => scope === undefined).map(({ name }) => name),
        "enum",
      ),
      ...names(
        file.records.filter(({ name }) => name !== inside.name).map(({ name }) => name),
        "record",
      ),
      ...names(
        scalars.map(({ name }) => name),
        "scalar",
      ),
    ];
  }
  // Inside a profile's or a modifier's values: a dimension, of the profile's
  // environment when it has one.
  if (inside?.kind === "assignments" && /(^|\{|,)\s*$/.test(statement)) {
    const environment = file.environments.find(({ name }) => name === inside.environment);
    const given = statement.slice(statement.lastIndexOf("{") + 1);
    const each = environment?.dimensions.map(({ name }) => name);
    return unwritten(each === undefined ? dimensions() : names(each, "dimension"), given);
  }

  if (typed === undefined || type === undefined) {
    return statement === "" ? names(topKeywords, "keyword") : [];
  }
  const states = names(
    typed.states.map(({ name }) => name),
    "state",
  );
  const needs = names(
    typed.needs.map(({ name }) => name),
    "dimension",
  );

  // Inside a type: a state's enum, and a child's type.
  if (/^state\s+/.test(statement) && /:\s*$/.test(statement)) {
    return names(visible(file, type.name, file.enums), "enum");
  }
  if (/^has\s+[A-Za-z0-9-]+\s*:\s*$/.test(statement)) {
    const around = new Set(chain(file, type.name));
    return names(
      visible(file, type.name, file.types).filter(
        (name) => !around.has(resolve(file, type.name, name)),
      ),
      "type",
    );
  }
  // A trigger: its event, then what it does.
  if (/^on\s+$/.test(statement)) {
    return [
      ...names(
        typed.events.map(({ name }) => name),
        "event",
      ),
      ...names(
        typed.children.map(({ name }) => name),
        "child",
      ),
      ...needs,
    ];
  }
  if (/^on\s+[^:]+:\s*([^,]+,\s*)*$/.test(statement) && !/\bonly\s+when\b/.test(statement)) {
    return [
      ...names(
        typed.actions.map(({ name }) => name.name),
        "action",
      ),
      ...names(
        typed.children.map(({ name }) => name),
        "child",
      ),
      ...states,
    ];
  }
  // A condition, what is alike, and what is provided.
  if (/(\bwhen|\band|\bor|\()\s*$/.test(statement) || /^alike\s+$/.test(statement)) {
    return [...states, ...needs];
  }
  if (/^provides\s+$/.test(statement)) return states;
  if (statement === "" && inside?.kind === "type") {
    return [...names(typeKeywords, "keyword"), ...states];
  }
  return [];
}

// The type with a full name.
const typeNamed = (file: ParseResult, name: string) =>
  file.types.find((candidate) => candidate.name === name);

// The values of a state of a type, or of a dimension: a capitalized name is a
// dimension, any other a state.
function valuesOf(
  file: ParseResult,
  type: Type | undefined,
  subject: string,
  inside: Open | undefined,
): string[] {
  if (/^[A-Z]/.test(subject)) {
    return (
      file.dimensions.find(({ name }) => name === subject)?.values.map(({ name }) => name) ?? []
    );
  }
  // In a child's bindings, a state on the left is the child's.
  const owner = inside?.kind === "bindings" ? typeNamed(file, inside.type) : type;
  const enumName = owner?.states.find(({ name }) => name === subject)?.enum.name;
  return file.enums.find(({ name }) => name === enumName)?.values.map(({ name }) => name) ?? [];
}

// The type a path of children leads to, from a type.
function along(file: ParseResult, from: Type, parts: string[]): Type | undefined {
  let type: Type | undefined = from;
  for (const part of parts) {
    const child: Type["children"][number] | undefined = type?.children.find(
      ({ name }) => name === part,
    );
    type = child === undefined ? undefined : typeNamed(file, child.type.name);
  }
  return type;
}

// A type's full name, and those of the types around it, innermost first.
function chain(file: ParseResult, name: string): string[] {
  const result: string[] = [];
  for (let at: string | undefined = name; at !== undefined; at = typeNamed(file, at)?.scope) {
    result.push(at);
  }
  return result;
}

// The declarations seen from inside a type, by the names they are seen by:
// its own and those of the types around it first, by their short names, then
// the file's.
function visible(file: ParseResult, type: string, declarations: Declaration[]): string[] {
  const result: string[] = [];
  for (const at of chain(file, type)) {
    for (const declaration of declarations) {
      if (declaration.scope === at) result.push(declaration.short ?? declaration.name);
    }
  }
  for (const declaration of declarations) {
    if (declaration.scope === undefined) result.push(declaration.name);
  }
  return [...new Set(result)];
}

// The full name a name seen from inside a type means.
function resolve(file: ParseResult, type: string, name: string): string {
  for (const at of chain(file, type)) {
    if (typeNamed(file, `${at}.${name}`) !== undefined) return `${at}.${name}`;
  }
  return name;
}

// What is open at a line and a column, from the braces before it: each brace
// is what the line it opens on starts with.
function opened(file: ParseResult, lines: string[], line: number, column: number): Open[] {
  const stack: Open[] = [];
  for (let row = 0; row < line; row++) {
    let text = (lines[row] ?? "").replace(/"[^"]*"/g, '""').replace(/#.*$/, "");
    if (row === line - 1) text = text.slice(0, column - 1);
    for (let at = 0; at < text.length; at++) {
      if (text[at] === "}") stack.pop();
      if (text[at] !== "{") continue;
      const head = text.slice(0, at).trim();
      const types = stack.filter((item) => item.kind === "type") as { name: string }[];
      const parent = types.at(-1)?.name;
      const typeHead = head.match(/^type\s+([A-Za-z0-9-]+)/);
      const recordHead = head.match(/^record\s+([A-Za-z0-9-]+)/);
      const childHead = head.match(/^has\s+[A-Za-z0-9-]+\s*:\s*([A-Za-z0-9.-]+)/);
      const profileHead = head.match(/^profile\s+[A-Za-z0-9-]+\s*:\s*([A-Za-z0-9-]+)/);
      if (/\bwhen\s+[A-Za-z0-9-]+\s*$/.test(head)) stack.push({ kind: "other" });
      else if (/^expect\b/.test(head)) stack.push({ kind: "expect", line: row + 1 });
      else if (typeHead !== null) {
        const name = typeHead[1] as string;
        stack.push({ kind: "type", name: parent === undefined ? name : `${parent}.${name}` });
      } else if (recordHead !== null) stack.push({ kind: "record", name: recordHead[1] as string });
      else if (childHead !== null) {
        const written = childHead[1] as string;
        stack.push({
          kind: "bindings",
          type: parent === undefined ? written : resolve(file, parent, written),
        });
      } else if (profileHead !== null) {
        stack.push({ kind: "assignments", environment: profileHead[1] as string });
      } else if (/^modifier\s/.test(head)) stack.push({ kind: "assignments" });
      else stack.push({ kind: "other" });
    }
  }
  return stack;
}

const expectKeywords = ["in", "when", "on", "then", "some", "absent"];

// What fits in an expectation, which starts on a line: the element's path,
// the keys of the elements it is about and their values, and their events.
function inExpectation(
  file: ParseResult,
  lines: string[],
  line: number,
  statement: string,
): Completion[] {
  const names = (labels: string[], kind: CompletionKind) =>
    [...new Set(labels)].map((label) => ({ label, kind }));
  if (statement === "") return names(expectKeywords, "keyword");
  if (/^in\s+$/.test(statement))
    return names(
      file.types.map(({ name }) => name),
      "type",
    );
  const pathSoFar = statement.match(/^in\s+([A-Za-z0-9.-]+)\.$/);
  if (pathSoFar !== null) {
    const children = elementAt(file, pathSoFar[1] as string)?.target.children ?? [];
    return names(
      children.map(({ name }) => name),
      "child",
    );
  }

  // The block's own lines: the element it names, and whether it has an event.
  const block: string[] = [];
  for (let at = line - 1; at < lines.length; at++) {
    const text = lines[at] ?? "";
    if (at > line - 1 && /^\s*}/.test(text)) break;
    block.push(text);
  }
  const named = block
    .map((text) => text.match(/^\s*in\s+([A-Za-z0-9.-]+)(\s+and\s+below)?/))
    .find(Boolean);
  if (named === undefined || named === null) return [];
  const path = named[1] as string;
  const below = named[2] !== undefined;
  const event = block.some((text) => /^\s*on\s/.test(text));
  const elements = treePaths(file).filter(
    (element) => element === path || (below && element.startsWith(`${path}.`)),
  );
  const places = (elements.length > 0 ? elements : [path]).flatMap((element) => {
    const place = elementAt(file, element);
    return place === undefined ? [] : [place];
  });

  // An event: the element's own, a child's by its path, or a dimension's.
  if (/^on\s+$/.test(statement)) {
    return [
      ...names(
        places.flatMap(({ target }) => target.events.map(({ name }) => name)),
        "event",
      ),
      ...names(
        places.flatMap(({ target }) => target.children.map(({ name }) => name)),
        "child",
      ),
      ...names(
        places.flatMap(({ dimensions }) => dimensions),
        "dimension",
      ),
    ];
  }
  const eventPath = statement.match(/^on\s+([A-Za-z0-9.-]+)\.$/);
  if (eventPath !== null) {
    const ends = places.flatMap(({ target }) => {
      const end = along(file, target, (eventPath[1] as string).split("."));
      return end === undefined ? [] : [end];
    });
    return [
      ...names(
        ends.flatMap(({ events }) => events.map(({ name }) => name)),
        "event",
      ),
      ...names(
        ends.flatMap(({ children }) => children.map(({ name }) => name)),
        "child",
      ),
    ];
  }

  // Every key an element has: its states, its parents' by their keys, and,
  // after an event, its children's by their paths; each with its state.
  const keys = new Map<string, Type["states"][number]>();
  const ofParents = new Set<string>();
  for (const place of places) {
    for (const state of place.target.states) keys.set(state.name, state);
    for (const parent of place.parents) {
      keys.set(parent.key, parent.state);
      ofParents.add(parent.key);
    }
    if (!event) continue;
    const walk = (type: Type, prefix: string, depth: number) => {
      if (depth > 4) return;
      for (const child of type.children) {
        const inner = file.types.find(({ name }) => name === child.type.name);
        if (inner === undefined) continue;
        for (const state of inner.states) keys.set(`${prefix}${child.name}.${state.name}`, state);
        walk(inner, `${prefix}${child.name}.`, depth + 1);
      }
    };
    walk(place.target, "", 0);
  }
  const dimensions = places.flatMap((place) => place.dimensions);

  // A value: of the profile, a dimension, or the state a key names.
  const valued = statement.match(/([A-Za-z0-9.+-]+)\s*=\s*$/);
  if (valued !== null) {
    const key = valued[1] as string;
    if (key === "profile")
      return names(
        file.profiles.map(({ name }) => name),
        "profile",
      );
    if (/^[A-Z]/.test(key)) {
      const dimension = file.dimensions.find(({ name }) => name === key);
      return names(dimension?.values.map(({ name }) => name) ?? [], "value");
    }
    const of = file.enums.find(({ name }) => name === keys.get(key)?.enum.name);
    return names(of?.values.map(({ name }) => name) ?? [], "value");
  }
  const withModifier = statement.match(/\bprofile\s*=\s*([A-Za-z0-9-]+)\+$/);
  if (withModifier !== null) {
    const fits = file.modifiers.filter(({ on }) => on.some(({ name }) => name === withModifier[1]));
    return names(
      fits.map(({ name }) => name),
      "profile",
    );
  }

  // A key, or the next part of one: after "when", "then" or "some", or a
  // comma between pairs.
  const keyed = statement.match(/^(when|then|some)\s+(?:.*,\s*)?([a-z][A-Za-z0-9.-]*\.)?$/);
  if (keyed === null) return [];
  const prefix = keyed[2] ?? "";
  // A condition is on anything the element has; what happens, on its own
  // states, or a child's: a parent's states, and the dimensions, are where it
  // is, which its event does not change.
  const condition = keyed[1] === "when";
  const result: Completion[] = [];
  for (const [key] of keys) {
    if (!key.startsWith(prefix) || (!condition && ofParents.has(key))) continue;
    const rest = key.slice(prefix.length).split(".");
    result.push({ label: rest[0] as string, kind: rest.length > 1 ? "child" : "state" });
  }
  if (prefix === "" && condition) {
    result.push(...names(dimensions, "dimension"));
    result.push({ label: "profile", kind: "keyword" });
  }
  const written = new Set(statement.split(/[^A-Za-z0-9.+-]+/));
  return result.filter(
    ({ label, kind }, index) =>
      !written.has(`${prefix}${label}`) &&
      result.findIndex((other) => other.label === label && other.kind === kind) === index,
  );
}

// The element at a path, or nothing for a path that is not one.
function elementAt(file: ParseResult, path: string): Placement | undefined {
  try {
    return placement(file, path);
  } catch {
    return undefined;
  }
}
