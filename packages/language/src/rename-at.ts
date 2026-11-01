import type { Child, Enum, Located, ParseResult, State, Type } from "./ast.js";
import { covers, links, type Span, wordAt } from "./definition.js";
import { article } from "./names.js";
import { parse } from "./parse.js";
import { isValue, renameChildInData, renameInData, renameStateInData } from "./rename.js";

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
  | { refusal: string }
  | { edits: Edit[]; data: { path: string; source: string }[] };

// What a declaration is, for renaming it: its kind, and for a value, the enum
// or dimension it is of.
interface Kind {
  kind: string;
  of?: Enum;
  dimension?: boolean;
  // For a state, the type it is of.
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
// both from one, wherever it is used: the edits to the source, and the stored
// data files that change, with their new content. Refused for a name that is
// not one of its kind's, a rename that would leave problems, and, for now, the
// names stored records hold other than an enum's values, states and children.
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
  const after = parse(apply(source, edits));
  const before = new Set(problems(file));
  const left = problems(after).filter((problem) => !before.has(problem));
  if (left.length > 0) return { refusal: `the rename would leave a problem: ${left[0]}` };
  const data: { path: string; source: string }[] = [];
  for (const item of stored) {
    const renamed =
      kind.kind === "value" && kind.of !== undefined
        ? renameInData(file, item.record, item.source, kind.of.name, name, to)
        : kind.kind === "state"
          ? renameStateInData(file, item.source, found.declared as State, to)
          : kind.kind === "child"
            ? renameChildInData(file, item.source, found.declared as Child, to)
            : undefined;
    if (renamed !== undefined && renamed.changed > 0) {
      data.push({ path: item.path, source: renamed.source });
    }
  }
  return { edits, data };
}

// How each kind that can be renamed is named.
const rules: Record<string, { pattern: RegExp; text: string }> = {
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
  file.diagnostics.filter(({ severity }) => severity === "error").map(({ message }) => message);

// The declaration whose name is at a line and a column, from where it is
// declared or used: its kind, its name, and every span to rename; or why it
// cannot be renamed.
function target(
  file: ParseResult,
  source: string,
  line: number,
  column: number,
):
  | { kind: Kind; name: string; from: Span; spans: Span[]; declared: Located }
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
  const spans = [
    span(declared),
    ...all.filter(({ to }) => to === declared).map(({ from }) => from),
  ].map(last);
  const name = (declared as { short?: string }).short ?? declared.name;
  const from = last(link?.from ?? span(declared));
  if (rules[kind.kind] === undefined || (kind.kind === "value" && kind.dimension)) {
    const what =
      kind.kind === "value"
        ? `a value of the dimension ${kind.of?.name}`
        : `${article(kind.kind)} ${kind.kind}`;
    const why =
      kind.kind === "record"
        ? "its stored records are in a folder named after it"
        : "stored records name it";
    return { refusal: `${name} is ${what}, and ${why}; renaming it here is not supported yet` };
  }
  // A provided state is received below by its name, and a received one is
  // matched to the one provided above by its own.
  const state = declared as State;
  if (kind.kind === "state" && state.received) {
    return {
      refusal: `${name} is received by its name from a type above; renaming it here is not supported yet`,
    };
  }
  if (kind.kind === "state" && kind.type?.provides.some((provided) => provided.name === name)) {
    return {
      refusal: `${name} is provided by its name to the types below; renaming it here is not supported yet`,
    };
  }
  return { kind, name, from, spans, declared };
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
    for (const action of type.actions) result.set(action.name, { kind: "action" });
    for (const event of type.events) result.set(event, { kind: "event" });
    for (const child of type.children) result.set(child, { kind: "child" });
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
