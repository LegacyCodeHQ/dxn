import type { Child, Condition, Declaration, Enum, Located, ParseResult, Type } from "./ast.js";
import { type Placement, placement } from "./evaluate.js";
import { parse } from "./parse.js";
import { treePaths } from "./status.js";

// A name as it is written in a file, and what it means: a declaration's own
// name, one of the type a path into its children leads to, or a value of an
// enum or a dimension.
interface Reference {
  at: Located;
  // A declaration, by its full name.
  declared?: string;
  // A path from a type, through its children, to a state, an action or an
  // event of the type at its end, or to the last child.
  path?: { from: Type; to: "state" | "action" | "event" | "child" };
  // A value, of an enum or a dimension by its full name.
  of?: string;
}

// Where going to a definition goes from: a line and a column, both from one,
// and how many characters.
export interface Span {
  line: number;
  column: number;
  length: number;
}

// A span of the source that refers to a declaration, and the name in that
// declaration it refers to.
interface Link {
  from: Span;
  to: Located;
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
  return links(source).find(({ from }) => covers(from, line, column));
}

// Where the name at a line and a column of a source, both from one, is
// declared, and every place it is used, in the order they are written: from
// the declaration itself, or from any place it is used. Nothing at a keyword,
// or a name the file does not declare.
export function usages(
  source: string,
  line: number,
  column: number,
): { declaration: Span; usages: Span[] } | undefined {
  const all = links(source);
  const lines = source.split("\n");
  const span = (at: Located): Span => ({
    line: at.line,
    column: at.column,
    length: wordAt(lines, at.line, at.column).length,
  });
  const target =
    all.find(({ from }) => covers(from, line, column))?.to ??
    all.map(({ to }) => to).find((to) => covers(span(to), line, column));
  if (target === undefined) return undefined;
  return {
    declaration: span(target),
    usages: all.filter(({ to }) => to === target).map(({ from }) => from),
  };
}

export const covers = (span: Span, line: number, column: number) =>
  span.line === line && column >= span.column && column <= span.column + span.length;

// The word written at a line and a column: a name, a path of names, or a
// profile with its modifiers.
export const wordAt = (lines: string[], line: number, column: number) =>
  (lines[line - 1] ?? "").slice(column - 1).match(/^[A-Za-z0-9.+-]+/)?.[0] ?? "";

// Every span of the source that refers to a declaration, in the order they are
// written, each with the name it refers to; a path into children, a span for
// each of its parts.
export function links(source: string, file: ParseResult = parse(source)): Link[] {
  const lines = source.split("\n");
  const declared = declarations(file);
  const result: Link[] = [];
  for (const reference of references(file)) {
    const { at } = reference;
    const written = wordAt(lines, at.line, at.column);
    if (written === "") continue;
    const whole = { line: at.line, column: at.column, length: written.length };
    if (reference.declared !== undefined) {
      const to = declared.get(reference.declared);
      if (to !== undefined) result.push({ from: whole, to });
    }
    if (reference.of !== undefined) {
      const declaration = declared.get(reference.of) as Enum | undefined;
      const to = declaration?.values?.find(({ name }) => name === at.name);
      if (to !== undefined) result.push({ from: whole, to });
    }
    if (reference.path !== undefined) {
      const parts = written.split(".");
      let column = at.column;
      for (const [index, part] of parts.entries()) {
        const to = along(file, reference.path.from, parts, index, reference.path.to);
        if (to !== undefined)
          result.push({ from: { line: at.line, column, length: part.length }, to });
        column += part.length + 1;
      }
    }
  }
  result.push(...expectationLinks(file, lines, declared));
  return result.sort((a, b) => a.from.line - b.from.line || a.from.column - b.from.column);
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
  const value = (at: Located, of: string | undefined) => {
    if (of !== undefined) result.push({ at, of });
  };
  // What the values of a state of a type, or of a dimension, come from: a
  // capitalized name is a dimension, any other a state.
  const valuesOf = (type: Type | undefined, subject: string) =>
    /^[A-Z]/.test(subject) ? subject : type?.states.find(({ name }) => name === subject)?.enum.name;
  // In a condition, a capitalized name is a dimension, any other a state; and
  // the values it compares are that dimension's, or that state's enum's.
  const condition = (type: Type, when: Condition | undefined) => {
    if (when === undefined) return;
    if (when.kind !== "compare") {
      for (const term of when.terms) condition(type, term);
      return;
    }
    if (/^[A-Z]/.test(when.subject.name)) declared(when.subject);
    else own(type, when.subject, "state");
    for (const compared of when.values) value(compared, valuesOf(type, when.subject.name));
  };
  for (const type of file.types) {
    for (const need of type.needs) declared(need);
    for (const state of type.states) {
      declared(state.enum);
      if (state.fixed !== undefined) value(state.fixed, state.enum.name);
      if (state.derived !== undefined) {
        declared(state.derived.dimension);
        for (const { values, result } of state.derived.branches) {
          for (const branch of values) value(branch, state.derived.dimension.name);
          value(result, state.enum.name);
        }
      }
    }
    for (const rule of type.rules) {
      own(type, rule.state, "state");
      value(rule.value, valuesOf(type, rule.state.name));
      condition(type, rule.when);
    }
    for (const child of type.children) {
      declared(child.type);
      condition(type, child.when);
      const inner = file.types.find(({ name }) => name === child.type.name);
      for (const binding of child.bindings ?? []) {
        if (inner !== undefined) own(inner, binding.state, "state");
        // A binding takes its values from a state, or a dimension.
        if (/^[A-Z]/.test(binding.from.name)) declared(binding.from);
        else own(type, binding.from, "state");
        for (const { values, result } of binding.map ?? []) {
          for (const branch of values) value(branch, valuesOf(type, binding.from.name));
          value(result, valuesOf(inner, binding.state.name));
        }
      }
    }
    for (const provided of type.provides) own(type, provided, "state");
    for (const action of type.actions) {
      own(type, action.state, "state");
      value(action.from, valuesOf(type, action.state.name));
      value(action.to, valuesOf(type, action.state.name));
    }
    for (const trigger of type.triggers) {
      if (trigger.event.kind === "named") own(type, trigger.event.name, "event");
      else {
        declared(trigger.event.dimension);
        for (const to of trigger.event.values) value(to, trigger.event.dimension.name);
      }
      for (const effect of trigger.does) {
        if (effect.kind === "action") own(type, effect.name, "action");
        else {
          own(type, effect.state, "state");
          value(effect.to, valuesOf(type, effect.state.name));
        }
      }
      condition(type, trigger.when);
    }
    for (const alike of type.alikes) {
      if (/^[A-Z]/.test(alike.subject.name)) declared(alike.subject);
      else own(type, alike.subject, "state");
      for (const alikeValue of alike.values ?? []) {
        value(alikeValue, valuesOf(type, alike.subject.name));
      }
      condition(type, alike.when);
    }
  }
  for (const environment of file.environments) {
    for (const dimension of environment.dimensions) declared(dimension);
  }
  for (const profile of file.profiles) {
    declared(profile.environment);
    for (const assignment of profile.values) {
      declared(assignment.dimension);
      value(assignment.value, assignment.dimension.name);
    }
  }
  for (const modifier of file.modifiers) {
    for (const profile of modifier.on) declared(profile);
    for (const assignment of modifier.values) {
      declared(assignment.dimension);
      value(assignment.value, assignment.dimension.name);
    }
  }
  for (const record of file.records) {
    for (const field of record.fields) {
      declared(field.type);
      if (field.derived === undefined) continue;
      const on = record.fields.find(({ name }) => name === field.derived?.on.name);
      for (const { values, result } of field.derived.branches) {
        for (const branch of values) value(branch, on?.type.name);
        value(result, field.type.name);
      }
    }
  }
  return result;
}

// The links in expectations: the element's path, part by part; each key, to
// the state it names in each element it applies to, or a dimension; each
// value, to its key's enum's or dimension's, or a profile's and its
// modifiers'; and the event.
function expectationLinks(
  file: ParseResult,
  lines: string[],
  declared: Map<string, Declaration>,
): Link[] {
  const result: Link[] = [];
  // A span for each part of a name, split at a separator, from where it is.
  const parts = (at: Located, separator: string) => {
    const spans: { part: string; from: Span }[] = [];
    let column = at.column;
    for (const part of wordAt(lines, at.line, at.column).split(separator)) {
      spans.push({ part, from: { line: at.line, column, length: part.length } });
      column += part.length + separator.length;
    }
    return spans;
  };
  const add = (from: Span, to: Located | undefined) => {
    if (to === undefined) return;
    const same = result.some(
      (link) => link.to === to && link.from.line === from.line && link.from.column === from.column,
    );
    if (!same) result.push({ from, to });
  };
  const valueIn = (of: string | undefined, name: string) =>
    (declared.get(of ?? "") as Enum | undefined)?.values?.find((value) => value.name === name);
  for (const expectation of file.expectations) {
    const path = expectation.path.name;
    // The path: its type, written with its own dots, then a child for each
    // part after it.
    const spans = parts(expectation.path, ".");
    const first = spans.findIndex(({ part }) => /^[a-z]/.test(part));
    const rootParts = first === -1 ? spans : spans.slice(0, first);
    for (const [index, { from }] of rootParts.entries()) {
      const name = rootParts
        .slice(0, index + 1)
        .map(({ part }) => part)
        .join(".");
      add(from, declared.get(name));
    }
    const root = file.types.find(
      ({ name }) => name === rootParts.map(({ part }) => part).join("."),
    );
    if (root === undefined) continue;
    const children = spans.slice(rootParts.length);
    for (const [index, { from }] of children.entries()) {
      add(
        from,
        along(
          file,
          root,
          children.map(({ part }) => part),
          index,
          "child",
        ),
      );
    }
    // The elements its keys are about: the one it names, and with "and
    // below", every element under it.
    const named = treePaths(file).filter(
      (element) => element === path || (expectation.below && element.startsWith(`${path}.`)),
    );
    const places: Placement[] = [];
    for (const element of named.length > 0 ? named : [path]) {
      try {
        places.push(placement(file, element));
      } catch {
        // A path that is not one is checked, and reported, elsewhere.
      }
    }
    for (const { key, value } of [...expectation.when, ...expectation.values]) {
      if (key.name === "profile") {
        const [profile, ...modifiers] = parts(value, "+");
        if (profile !== undefined) add(profile.from, declared.get(profile.part));
        for (const modifier of modifiers) add(modifier.from, declared.get(modifier.part));
        continue;
      }
      const keyParts = parts(key, ".");
      if (/^[A-Z]/.test(key.name)) {
        for (const { from } of keyParts) add(from, declared.get(key.name));
        add(span(lines, value), valueIn(key.name, value.name));
        continue;
      }
      const names = keyParts.map(({ part }) => part);
      for (const place of places) {
        const steps = place.steps;
        const rootType = steps[0]?.type as Type;
        // A parent's state, by its path from the type; or the element's own,
        // or, after an event, a child's by its path from the element.
        const parent = place.parents.find((candidate) => candidate.key === key.name);
        const from = parent !== undefined ? rootType : place.target;
        let state: Located | undefined;
        for (const [index, { from: at }] of keyParts.entries()) {
          const last = index === keyParts.length - 1;
          const to = along(file, from, names, index, last ? "state" : "child");
          add(at, to);
          if (last) state = to;
        }
        const enumName = (state as { enum?: Located } | undefined)?.enum?.name;
        add(span(lines, value), valueIn(enumName, value.name));
      }
    }
    const on = expectation.on;
    if (on?.kind === "dimension") {
      add(span(lines, on.dimension), declared.get(on.dimension.name));
      for (const to of on.values) add(span(lines, to), valueIn(on.dimension.name, to.name));
    } else if (on !== undefined) {
      const eventParts = parts(on.name, ".");
      const names = eventParts.map(({ part }) => part);
      for (const place of places) {
        for (const [index, { from }] of eventParts.entries()) {
          const last = index === eventParts.length - 1;
          add(from, along(file, place.target, names, index, last ? "event" : "child"));
        }
      }
    }
  }
  return result;
}

// The span of a name, as it is written.
function span(lines: string[], at: Located): Span {
  return { line: at.line, column: at.column, length: wordAt(lines, at.line, at.column).length };
}
