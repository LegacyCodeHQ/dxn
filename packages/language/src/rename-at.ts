import type { Child, Diagnostic, Enum, Located, ParseResult, State, Type } from "./ast.js";
import { covers, links, type Span, wordAt } from "./definition.js";
import { placement } from "./evaluate.js";
import { among, article } from "./names.js";
import { parse } from "./parse.js";
import {
  isValue,
  renameChildInData,
  renameDimensionInData,
  renameInData,
  renameProfileInData,
  renameStateInData,
  renameTypeInData,
} from "./rename.js";
import { treePaths } from "./status.js";
import { folderOf } from "./store.js";

// A stored data file of a record, by its path, and its content.
export interface StoredFile {
  record: string;
  path: string;
  source: string;
}

// An edit to a source: the text at a line and a column, both from one, for so
// many characters, replaced.
export interface Edit {
  line: number;
  column: number;
  length: number;
  text: string;
}

export type Renamed =
  // With the problems the rename would leave, when that is why.
  | { refusal: string; problems?: Diagnostic[] }
  | {
      // What is renamed: its kind, and its name as dxn writes it.
      kind: string;
      name: string;
      edits: Edit[];
      // The source, renamed.
      source: string;
      // The stored data files that change, and how many changes each has.
      data: { path: string; source: string; changed: number }[];
      // For a record, the folder its stored records are in, by its old name
      // and its new, next to the file.
      folder?: { from: string; to: string };
    };

// What a declaration is, for renaming it: its kind, and for a value, the enum
// or dimension it is of.
interface Kind {
  kind: string;
  of?: Enum;
  dimension?: boolean;
  // For a state, an action, an event or a child, the type it is of.
  type?: Type;
}

// What can be renamed at a line and a column of a source, both from one: the
// name there, as written, and its span; or why it cannot be.
export function renameable(
  source: string,
  line: number,
  column: number,
): { from: Span; name: string } | { refusal: string } {
  const found = target(parse(source), source, line, column);
  if ("refusal" in found) return found;
  return { from: found.from, name: found.name };
}

// Renames the declaration whose name is at a line and a column of a source,
// both from one, wherever it is used: the edits to the source, the stored
// data files that change, with their new content, and for a record, the
// folder its stored records move to. Refused for a name that is not one of its
// kind's, and a rename that would leave problems.
export function renameAt(
  source: string,
  line: number,
  column: number,
  to: string,
  stored: StoredFile[] = [],
): Renamed {
  const file = parse(source);
  const found = target(file, source, line, column);
  if ("refusal" in found) return found;
  const { kind, spans, name } = found;
  const rule = rules[kind.kind];
  if (rule !== undefined && !rule.pattern.test(to)) {
    return {
      refusal: `${JSON.stringify(to)} is not ${article(kind.kind)} ${kind.kind} name: ${rule.text}`,
    };
  }
  if (to === name) return { refusal: `${name} is already its name` };
  const edits = spans.map((span) => ({ ...span, text: to }));
  // The rename must leave the file as sound as it was.
  const renamedSource = apply(source, edits);
  const after = parse(renamedSource);
  const before = new Set(problems(file).map(({ message }) => message));
  const left = problems(after).filter(({ message }) => !before.has(message));
  if (left.length > 0) {
    return { refusal: `the rename would leave a problem: ${left[0]?.message}`, problems: left };
  }
  const data: { path: string; source: string; changed: number }[] = [];
  for (const item of stored) {
    // A state is renamed with the states it is provided to, or received from.
    if (kind.kind === "state") {
      let source = item.source;
      let changed = 0;
      for (const state of found.group) {
        const renamed = renameStateInData(file, source, state as State, to);
        source = renamed.source;
        changed += renamed.changed;
      }
      if (changed > 0) data.push({ path: item.path, source, changed });
      continue;
    }
    const renamed =
      kind.kind === "value" && kind.dimension && kind.of !== undefined
        ? renameDimensionInData(item.source, kind.of.name, to, name)
        : kind.kind === "dimension"
          ? renameDimensionInData(item.source, name, to)
          : kind.kind === "value" && kind.of !== undefined
            ? renameInData(file, item.record, item.source, kind.of.name, name, to)
            : kind.kind === "child"
              ? renameChildInData(file, item.source, found.declared as Child, to)
              : kind.kind === "type"
                ? renameTypeInData(item.source, found.declared as Type, to)
                : kind.kind === "profile" || kind.kind === "modifier"
                  ? renameProfileInData(item.source, kind.kind, name, to)
                  : undefined;
    if (renamed !== undefined && renamed.changed > 0) {
      data.push({ path: item.path, source: renamed.source, changed: renamed.changed });
    }
  }
  const done = {
    kind: kind.kind,
    name: qualified(found.declared, kind),
    edits,
    source: renamedSource,
    data,
  };
  if (kind.kind === "record") {
    return { ...done, folder: { from: folderOf(name), to: folderOf(to) } };
  }
  return done;
}

// How each kind that can be renamed is named.
const rules: Record<string, { pattern: RegExp; text: string }> = {
  record: { pattern: /^[A-Z][A-Za-z0-9]*$/, text: "a capital letter, then letters and digits" },
  dimension: { pattern: /^[A-Z][A-Za-z0-9]*$/, text: "a capital letter, then letters and digits" },
  profile: {
    pattern: /^[a-z][A-Za-z0-9-]*$/,
    text: "a lowercase letter, then letters, digits and hyphens",
  },
  type: { pattern: /^[A-Z][A-Za-z0-9]*$/, text: "a capital letter, then letters and digits" },
  child: {
    pattern: /^[a-z][A-Za-z0-9-]*$/,
    text: "a lowercase letter, then letters, digits and hyphens",
  },
  state: {
    pattern: /^[a-z][A-Za-z0-9-]*$/,
    text: "a lowercase letter, then letters, digits and hyphens",
  },
  enum: { pattern: /^[A-Z][A-Za-z0-9]*$/, text: "a capital letter, then letters and digits" },
  environment: {
    pattern: /^[A-Z][A-Za-z0-9]*$/,
    text: "a capital letter, then letters and digits",
  },
  action: {
    pattern: /^[a-z][A-Za-z0-9-]*$/,
    text: "a lowercase letter, then letters, digits and hyphens",
  },
  event: {
    pattern: /^[a-z][A-Za-z0-9-]*$/,
    text: "a lowercase letter, then letters, digits and hyphens",
  },
  modifier: {
    pattern: /^[a-z][A-Za-z0-9-]*$/,
    text: "a lowercase letter, then letters, digits and hyphens",
  },
  value: {
    pattern: { test: isValue } as unknown as RegExp,
    text: "a letter or digit, then letters, digits and hyphens",
  },
};

// The errors in a file, each as it is reported.
const problems = (file: ParseResult) =>
  file.diagnostics.filter(({ severity }) => severity === "error");

// A declaration's name as dxn writes it from outside: a value with its enum's
// or dimension's, and a state, an action, an event or a child with its type's.
function qualified(at: Located, { kind, of, type }: Kind): string {
  if (kind === "value") return `${of?.name}.${at.name}`;
  if (["state", "action", "event", "child"].includes(kind)) return `${type?.name}.${at.name}`;
  return at.name;
}

// The declaration whose name is at a line and a column, from where it is
// declared or used: its kind, its name, and every span to rename; or why it
// cannot be renamed.
function target(
  file: ParseResult,
  source: string,
  line: number,
  column: number,
):
  | { kind: Kind; name: string; from: Span; spans: Span[]; declared: Located; group: Located[] }
  | { refusal: string } {
  const lines = source.split("\n");
  const kinds = kindsOf(file);
  const span = (at: Located): Span => ({
    line: at.line,
    column: at.column,
    length: wordAt(lines, at.line, at.column).length,
  });
  const all = links(source, file);
  const link = all.find(({ from }) => covers(from, line, column));
  const declared = link?.to ?? [...kinds.keys()].find((at) => covers(span(at), line, column));
  const kind = declared === undefined ? undefined : kinds.get(declared);
  if (declared === undefined || kind === undefined)
    return { refusal: "there is no name here to rename" };
  // A name written with the type it is in, "<Type>.<Name>", is renamed in its
  // last part.
  const last = (at: Span): Span => {
    const written = (lines[at.line - 1] ?? "").slice(at.column - 1, at.column - 1 + at.length);
    const dot = written.lastIndexOf(".");
    return dot === -1
      ? at
      : { line: at.line, column: at.column + dot + 1, length: at.length - dot - 1 };
  };
  // A state provided to the types below, or received from one above, is
  // matched to the others by its name: they are renamed together.
  const group = kind.kind === "state" ? connected(file, declared as State) : [declared];
  const spans = group
    .flatMap((each) => [span(each), ...all.filter(({ to }) => to === each).map(({ from }) => from)])
    .map(last)
    .filter(
      (each, index, list) =>
        list.findIndex((other) => other.line === each.line && other.column === each.column) ===
        index,
    );
  const name = (declared as { short?: string }).short ?? declared.name;
  const from = last(link?.from ?? span(declared));
  return { kind, name, from, spans, declared, group };
}

// Every declaration a name can be, with its kind.
function kindsOf(file: ParseResult): Map<Located, Kind> {
  const result = new Map<Located, Kind>();
  for (const declaration of file.enums) {
    result.set(declaration, { kind: "enum" });
    for (const value of declaration.values) result.set(value, { kind: "value", of: declaration });
  }
  for (const declaration of file.dimensions) {
    result.set(declaration, { kind: "dimension" });
    for (const value of declaration.values) {
      result.set(value, { kind: "value", of: declaration, dimension: true });
    }
  }
  for (const type of file.types) {
    result.set(type, { kind: "type" });
    for (const state of type.states) result.set(state, { kind: "state", type });
    for (const action of type.actions) result.set(action.name, { kind: "action", type });
    for (const event of type.events) result.set(event, { kind: "event", type });
    for (const child of type.children) result.set(child, { kind: "child", type });
  }
  for (const declaration of file.environments) result.set(declaration, { kind: "environment" });
  for (const declaration of file.profiles) result.set(declaration, { kind: "profile" });
  for (const declaration of file.modifiers) result.set(declaration, { kind: "modifier" });
  for (const declaration of file.records) result.set(declaration, { kind: "record" });
  return result;
}

// A source with edits made.
function apply(source: string, edits: Edit[]): string {
  const lines = source.split("\n");
  const sorted = [...edits].sort((a, b) => b.line - a.line || b.column - a.column);
  for (const { line, column, length, text } of sorted) {
    const content = lines[line - 1] ?? "";
    lines[line - 1] = `${content.slice(0, column - 1)}${text}${content.slice(column - 1 + length)}`;
  }
  return lines.join("\n");
}

// A state, and every state it is provided to or received from, wherever its
// types are placed: a received state is matched to the nearest type above
// that provides one of its name.
function connected(file: ParseResult, state: State): State[] {
  const pairs: [State, State][] = [];
  for (const path of treePaths(file)) {
    let place: ReturnType<typeof placement>;
    try {
      place = placement(file, path);
    } catch {
      continue;
    }
    for (const { level, name, from } of place.received) {
      const below = place.steps[level]?.type.states.find(
        (each) => each.name === name && each.received,
      );
      const above = place.steps[from]?.type.states.find(
        (each) => each.name === name && !each.received,
      );
      if (below !== undefined && above !== undefined) pairs.push([below, above]);
    }
  }
  const group = [state];
  for (let added = true; added; ) {
    added = false;
    for (const [a, b] of pairs) {
      const has = (each: State) => group.includes(each);
      if (has(a) !== has(b)) {
        group.push(has(a) ? b : a);
        added = true;
      }
    }
  }
  return group;
}

// Where the declaration a name names is: a line and a column, both from one.
// A name is written as dxn writes it: a declaration of the file by its name,
// a type's or an enum's inside it by its full name, a value of an enum or a
// dimension as "<Enum>.<value>", and a type's state, action, event or child
// as "<Type>.<name>"; "<kind>:" before it picks one kind where a name names
// several. Refused for a name nothing is declared by, or that is ambiguous.
export function declarationNamed(
  source: string,
  target: string,
): { line: number; column: number } | { refusal: string } {
  const file = parse(source);
  const colon = target.indexOf(":");
  const kind = colon === -1 ? undefined : target.slice(0, colon);
  const name = colon === -1 ? target : target.slice(colon + 1);
  const named: { name: string; kind: string; at: Located }[] = [];
  for (const [at, kinded] of kindsOf(file)) {
    named.push({ name: qualified(at, kinded), kind: kinded.kind, at });
  }
  const found = named.filter(
    (each) => each.name === name && (kind === undefined || each.kind === kind),
  );
  const [only] = found;
  if (found.length === 1 && only !== undefined) {
    return { line: only.at.line, column: only.at.column };
  }
  if (found.length > 1) {
    const kinds = found.map((each) => `${each.kind}:${name}`);
    return {
      refusal: `${name} names ${found.map((each) => `${article(each.kind)} ${each.kind}`).join(" and ")}; say which: ${kinds.join(" or ")}`,
    };
  }
  const names = named
    .filter((each) => kind === undefined || each.kind === kind)
    .map((each) => each.name);
  const nothing = kind === undefined ? "nothing" : `no ${kind}`;
  // A name with a part before its last is compared with the others that
  // share that part, by its last.
  const dot = name.lastIndexOf(".");
  const last = name.slice(dot + 1);
  const siblings = [...new Set(names)].filter(
    (each) =>
      dot !== -1 && each.startsWith(name.slice(0, dot + 1)) && !each.slice(dot + 1).includes("."),
  );
  const suggested =
    siblings.length > 0
      ? among(name, siblings, "", last.length)
      : among(name, [...new Set(names)], "the file declares none");
  return { refusal: `${nothing} is declared as ${name}${suggested}` };
}
