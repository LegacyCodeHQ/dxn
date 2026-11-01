import type { Child, Condition, Declaration, Located, ParseResult, Type } from "./ast.js";
import { parse } from "./parse.js";

// A name as it is written in a file, and what it means: a declaration's own
// name, or one of the type a path into its children leads to.
interface Reference {
  at: Located;
  // A declaration, by its full name.
  declared?: string;
  // A path from a type, through its children, to a state, an action or an
  // event of the type at its end, or to the last child.
  path?: { from: Type; to: "state" | "action" | "event" | "child" };
}

// Where going to a definition goes from: a line and a column, both from one,
// and how many characters.
export interface Span {
  line: number;
  column: number;
  length: number;
}

// Where the name at a line and a column of a source, both from one, is
// declared: the name in its declaration, and the name it goes from, whole, or
// the part of a path the column is in. Nothing for a declaration itself, a
// keyword, or a name the file does not declare.
export function definition(
  source: string,
  line: number,
  column: number,
): { from: Span; to: Located } | undefined {
  const file = parse(source);
  const lines = source.split("\n");
  for (const reference of references(file)) {
    const { at } = reference;
    if (at.line !== line) continue;
    const written = (lines[line - 1] ?? "").slice(at.column - 1).match(/^[A-Za-z0-9.+-]+/)?.[0];
    if (written === undefined || column < at.column || column > at.column + written.length) {
      continue;
    }
    if (reference.declared !== undefined) {
      const to = declarations(file).get(reference.declared);
      return to === undefined
        ? undefined
        : { from: { line, column: at.column, length: written.length }, to };
    }
    if (reference.path !== undefined) {
      // The part of the path the column is in: a child on the way, or its end.
      const parts = written.split(".");
      const before = written.slice(0, column - at.column).split(".").length - 1;
      const to = along(file, reference.path.from, parts, before, reference.path.to);
      const start =
        at.column + parts.slice(0, before).reduce((sum, part) => sum + part.length + 1, 0);
      const length = parts[before]?.length ?? 0;
      return to === undefined ? undefined : { from: { line, column: start, length }, to };
    }
  }
  return undefined;
}

// Follows a path from a type through its children to its part at an index:
// a child, or, at its end, what the path names.
function along(
  file: ParseResult,
  from: Type,
  parts: string[],
  index: number,
  to: "state" | "action" | "event" | "child",
): Located | undefined {
  let type: Type | undefined = from;
  for (const [at, part] of parts.entries()) {
    if (type === undefined) return undefined;
    const last = at === parts.length - 1;
    if (last && to !== "child") {
      const own: Located[] =
        to === "state"
          ? type.states
          : to === "action"
            ? type.actions.map(({ name }) => name)
            : type.events;
      return at === index ? own.find(({ name }) => name === part) : undefined;
    }
    const child: Child | undefined = type.children.find(({ name }) => name === part);
    if (at === index) return child;
    const inner: string | undefined = child?.type.name;
    type = file.types.find(({ name }) => name === inner);
  }
  return undefined;
}

// Every declaration the file has, by its full name.
function declarations(file: ParseResult): Map<string, Declaration> {
  const all: Declaration[] = [
    ...file.enums,
    ...file.dimensions,
    ...file.types,
    ...file.environments,
    ...file.profiles,
    ...file.modifiers,
    ...file.records,
  ];
  const result = new Map<string, Declaration>();
  for (const declaration of all) {
    if (!result.has(declaration.name)) result.set(declaration.name, declaration);
  }
  return result;
}

// Every name in the file that refers to something declared elsewhere in it.
function references(file: ParseResult): Reference[] {
  const result: Reference[] = [];
  const declared = (at: Located) => result.push({ at, declared: at.name });
  const own = (from: Type, at: Located, to: "state" | "action" | "event" | "child") =>
    result.push({ at, path: { from, to } });
  // In a condition, a capitalized name is a dimension, any other a state.
  const condition = (type: Type, when: Condition | undefined) => {
    if (when === undefined) return;
    if (when.kind !== "compare") {
      for (const term of when.terms) condition(type, term);
      return;
    }
    if (/^[A-Z]/.test(when.subject.name)) declared(when.subject);
    else own(type, when.subject, "state");
  };
  for (const type of file.types) {
    for (const need of type.needs) declared(need);
    for (const state of type.states) {
      declared(state.enum);
      if (state.derived !== undefined) declared(state.derived.dimension);
    }
    for (const rule of type.rules) {
      own(type, rule.state, "state");
      condition(type, rule.when);
    }
    for (const child of type.children) {
      declared(child.type);
      condition(type, child.when);
      const inner = file.types.find(({ name }) => name === child.type.name);
      for (const binding of child.bindings ?? []) {
        if (inner !== undefined) own(inner, binding.state, "state");
        own(type, binding.from, "state");
      }
    }
    for (const provided of type.provides) own(type, provided, "state");
    for (const action of type.actions) own(type, action.state, "state");
    for (const trigger of type.triggers) {
      if (trigger.event.kind === "named") own(type, trigger.event.name, "event");
      else declared(trigger.event.dimension);
      for (const effect of trigger.does) {
        if (effect.kind === "action") own(type, effect.name, "action");
        else own(type, effect.state, "state");
      }
      condition(type, trigger.when);
    }
    for (const alike of type.alikes) {
      if (/^[A-Z]/.test(alike.subject.name)) declared(alike.subject);
      else own(type, alike.subject, "state");
      condition(type, alike.when);
    }
  }
  for (const environment of file.environments) {
    for (const dimension of environment.dimensions) declared(dimension);
  }
  for (const profile of file.profiles) {
    declared(profile.environment);
    for (const { dimension } of profile.values) declared(dimension);
  }
  for (const modifier of file.modifiers) {
    for (const profile of modifier.on) declared(profile);
    for (const { dimension } of modifier.values) declared(dimension);
  }
  for (const record of file.records) {
    for (const field of record.fields) declared(field.type);
  }
  return result;
}
