import {
  type Child,
  childAt,
  fixes,
  type Located,
  type ParseResult,
  type State,
  type Type,
  type Union,
} from "../core/ast.js";
import { type JsonNode, parseJson } from "../data/json.js";
import { type Placement, placement } from "../evaluation/evaluate.js";
import { childTypeAt } from "../evaluation/expect.js";
import { treePaths } from "../evaluation/status.js";
import { comparisons } from "../model/condition.js";
import { Names } from "../model/names.js";

// Replaces each span of the source, given by start and end offsets, with its
// text.
function replace(source: string, edits: { start: number; end: number; text: string }[]): string {
  let result = source;
  for (const { start, end, text } of [...edits].sort((a, b) => b.start - a.start)) {
    result = result.slice(0, start) + text + result.slice(end);
  }
  return result;
}

// Renames a value of an enum in the file that declares it: in the enum's
// declaration, and wherever a value of it is written: rules, children's
// conditions, bindings, fixed and derived states, actions, expectations and
// derived fields. A file without problems.
export function renameInSource(
  file: ParseResult,
  source: string,
  enumName: string,
  from: string,
  to: string,
): string {
  const starts = [0];
  for (let index = 0; index < source.length; index++) {
    if (source[index] === "\n") starts.push(index + 1);
  }
  const at = ({ line, column }: Located) => (starts[line - 1] as number) + column - 1;
  const named: Located[] = [];
  const declaration = file.enums.find(({ name }) => name === enumName);
  named.push(...(declaration?.values.filter(({ name }) => name === from) ?? []));
  for (const type of file.types) {
    for (const rule of type.rules) {
      const state = type.states.find(({ name }) => name === rule.state.name);
      if (state?.enum.name === enumName && rule.value.name === from) named.push(rule.value);
      for (const { subject, values } of comparisons(rule.when)) {
        const on = type.states.find(({ name }) => name === subject.name);
        if (on?.enum.name === enumName) named.push(...values.filter(({ name }) => name === from));
      }
    }
    // What is alike: the values of a state of that enum, and its condition.
    for (const { subject, values, when } of type.alikes) {
      const on = type.states.find(({ name }) => name === subject.name);
      if (on?.enum.name === enumName) {
        named.push(...(values ?? []).filter(({ name }) => name === from));
      }
      for (const compared of when === undefined ? [] : comparisons(when)) {
        const state = type.states.find(({ name }) => name === compared.subject.name);
        if (state?.enum.name === enumName) {
          named.push(...compared.values.filter(({ name }) => name === from));
        }
      }
    }
    // A trigger's change in place, and its condition: the values of a state
    // of that enum.
    for (const effect of type.triggers.flatMap(({ does }) => does)) {
      if (effect.kind !== "change") continue;
      const on = type.states.find(({ name }) => name === effect.state.name);
      if (on?.enum.name === enumName && effect.to.name === from) named.push(effect.to);
    }
    for (const { when } of type.triggers) {
      for (const { subject, values } of when === undefined ? [] : comparisons(when)) {
        const on = type.states.find(({ name }) => name === subject.name);
        if (on?.enum.name === enumName) named.push(...values.filter(({ name }) => name === from));
      }
    }
    for (const action of type.actions) {
      const state = type.states.find(({ name }) => name === action.state.name);
      if (state?.enum.name !== enumName) continue;
      named.push(...[action.from, action.to].filter(({ name }) => name === from));
    }
    for (const child of type.children) {
      for (const { subject, values } of child.when === undefined ? [] : comparisons(child.when)) {
        const on = type.states.find(({ name }) => name === subject.name);
        if (on?.enum.name === enumName) named.push(...values.filter(({ name }) => name === from));
      }
      const inner = file.types.find(({ name }) => name === child.type.name);
      for (const binding of child.bindings ?? []) {
        const { state, from: source, map } = binding;
        const subject = type.states.find(({ name }) => name === source.name);
        const target = inner?.states.find(({ name }) => name === state.name);
        // A fixed binding writes a value of the child's state.
        if (fixes(type, binding) && target?.enum.name === enumName && source.name === from) {
          named.push(source);
        }
        for (const branch of map ?? []) {
          if (subject?.enum.name === enumName) {
            named.push(...branch.values.filter(({ name }) => name === from));
          }
          if (target?.enum.name === enumName && branch.result.name === from) {
            named.push(branch.result);
          }
        }
      }
    }
    for (const state of type.states) {
      if (state.enum.name !== enumName) continue;
      if (state.fixed?.name === from) named.push(state.fixed);
      for (const { result } of state.derived?.branches ?? []) {
        if (result.name === from) named.push(result);
      }
    }
  }
  // An expectation's key is a state of an element it names, or of a parent's
  // in place: one of that enum at any of them.
  const paths = treePaths(file);
  for (const expectation of file.expectations) {
    const path = expectation.path.name;
    const elements = paths.filter(
      (candidate) => candidate === path || (expectation.below && candidate.startsWith(`${path}.`)),
    );
    const enumsOf = (key: string) =>
      elements.flatMap((element) => {
        try {
          const place = placement(file, element);
          // A key with a path names a child's state, after an event.
          const parts = key.split(".");
          const child =
            parts.length > 1
              ? childTypeAt(file, place.target, parts.slice(0, -1))?.states.find(
                  ({ name }) => name === parts.at(-1),
                )
              : undefined;
          const state =
            place.parents.find((parent) => parent.key === key)?.state ??
            place.target.states.find(({ name }) => name === key) ??
            child;
          return state === undefined ? [] : [state.enum.name];
        } catch {
          return [];
        }
      });
    for (const { key, value } of [...expectation.when, ...expectation.values]) {
      if (value.name === from && enumsOf(key.name).includes(enumName)) named.push(value);
    }
  }
  for (const record of file.records) {
    for (const field of record.fields) {
      if (field.derived === undefined) continue;
      const on = record.fields.find(({ name }) => name === field.derived?.on.name);
      for (const { values, result } of field.derived.branches) {
        if (on?.type.name === enumName) named.push(...values.filter(({ name }) => name === from));
        if (field.type.name === enumName && result.name === from) named.push(result);
      }
    }
  }
  return replace(
    source,
    named.map((item) => ({ start: at(item), end: at(item) + from.length, text: to })),
  );
}

// Renames a value of an enum in stored records of a record: every field of
// that enum, in nested records too, and every state of that enum in a
// record's context, keeping the rest of the file as it was. Data without
// problems.
export function renameInData(
  file: ParseResult,
  record: string,
  source: string,
  enumName: string,
  from: string,
  to: string,
): { source: string; changed: number } {
  const names = new Names(file);
  const edits: { start: number; end: number; text: string }[] = [];
  const rename = (node: JsonNode) => {
    if (node.kind === "string" && node.value === from) {
      edits.push({ start: node.span.start, end: node.span.end, text: JSON.stringify(to) });
    }
  };
  // The states in a context, those of that enum renamed: of its type, or of
  // the child at its path, and of the parents that place it.
  const context = (node: JsonNode) => {
    if (node.kind !== "object") return;
    const member = (name: string) => node.members.find(({ key }) => key.value === name)?.value;
    const typeName = member("type");
    const path = member("path");
    const place = path?.kind === "string" ? placement(file, path.value) : undefined;
    const type =
      place?.target ??
      file.types.find(({ name }) => typeName?.kind === "string" && name === typeName.value);
    const states = member("states");
    if (type === undefined || states?.kind !== "object") return;
    for (const { key, value } of states.members) {
      const state = type.states.find(({ name }) => name === key.value);
      if (state?.enum.name === enumName) rename(value);
    }
    const parents = member("parents");
    if (place === undefined || parents?.kind !== "object") return;
    for (const { key, value } of parents.members) {
      const state = place.parents.find((parent) => parent.key === key.value)?.state;
      if (state?.enum.name === enumName) rename(value);
    }
  };
  const visit = (node: JsonNode, type: string, stored = false) => {
    if (names.kindOf(type) === "record") {
      const declaration = file.records.find(({ name }) => name === type);
      if (node.kind !== "object" || declaration === undefined) return;
      for (const { key, value } of node.members) {
        if (stored && declaration.context && key.value === "context") {
          context(value);
          continue;
        }
        const field = declaration.fields.find(({ name }) => name === key.value);
        if (field !== undefined) visit(value, field.type.name);
      }
    } else if (type === enumName) {
      rename(node);
    }
  };
  const { root } = parseJson(source);
  if (root?.kind === "array") for (const element of root.elements) visit(element, record, true);
  return { source: replace(source, edits), changed: edits.length };
}

// Renames a state of a type in stored records' contexts: its key among the
// states of a context whose element is of that type, and the last part of its
// key among the parents of one it places. Data without problems.
export function renameStateInData(
  file: ParseResult,
  source: string,
  state: State,
  to: string,
): { source: string; changed: number } {
  const edits: { start: number; end: number; text: string }[] = [];
  const context = (node: JsonNode) => {
    if (node.kind !== "object") return;
    const member = (name: string) => node.members.find(({ key }) => key.value === name)?.value;
    const typeName = member("type");
    const path = member("path");
    let place: Placement | undefined;
    try {
      place = path?.kind === "string" ? placement(file, path.value) : undefined;
    } catch {
      return;
    }
    const type =
      place?.target ??
      file.types.find(({ name }) => typeName?.kind === "string" && name === typeName.value);
    const states = member("states");
    if (type !== undefined && states?.kind === "object") {
      for (const { key } of states.members) {
        if (type.states.find(({ name }) => name === key.value) !== state) continue;
        edits.push({ start: key.span.start, end: key.span.end, text: JSON.stringify(to) });
      }
    }
    const parents = member("parents");
    if (place === undefined || parents?.kind !== "object") return;
    for (const { key } of parents.members) {
      if (place.parents.find((parent) => parent.key === key.value)?.state !== state) continue;
      const parts = key.value.split(".");
      const renamed = [...parts.slice(0, -1), to].join(".");
      edits.push({ start: key.span.start, end: key.span.end, text: JSON.stringify(renamed) });
    }
  };
  const { root } = parseJson(source);
  if (root?.kind === "array") {
    for (const element of root.elements) {
      if (element.kind !== "object") continue;
      const found = element.members.find(({ key }) => key.value === "context");
      if (found !== undefined) context(found.value);
    }
  }
  return { source: replace(source, edits), changed: edits.length };
}

// Renames a child of a type in stored records' contexts: its part of a
// context's path, and of the keys of the parents a context's element has,
// wherever that part is that child. Data without problems.
export function renameChildInData(
  file: ParseResult,
  source: string,
  child: Child | Union,
  to: string,
): { source: string; changed: number } {
  const edits: { start: number; end: number; text: string }[] = [];
  // The parts of a path of children from a type, that child's renamed; none
  // when no part is. A member of a list is two parts, the list's name and its
  // tag: a member renamed is its tag, a list its name.
  const renamedFrom = (from: Type | undefined, parts: string[]) => {
    let type = from;
    let changed = false;
    const result: string[] = [];
    for (let at = 0; at < parts.length; ) {
      const found = type === undefined ? undefined : childAt(type, parts, at);
      if (found === undefined) {
        result.push(...parts.slice(at));
        break;
      }
      const written = parts.slice(at, found.next);
      if (found.child === child) {
        written[written.length - 1] = to;
        changed = true;
      } else if (
        written.length === 2 &&
        "members" in child &&
        child.members.includes(found.child)
      ) {
        written[0] = to;
        changed = true;
      }
      result.push(...written);
      at = found.next;
      const inner: string = found.child.type.name;
      type = file.types.find(({ name }) => name === inner);
    }
    return changed ? result : undefined;
  };
  const context = (node: JsonNode) => {
    if (node.kind !== "object") return;
    const member = (name: string) => node.members.find(({ key }) => key.value === name)?.value;
    const path = member("path");
    if (path?.kind !== "string") return;
    const segments = path.value.split(".");
    const first = segments.findIndex((segment) => /^[a-z]/.test(segment));
    if (first === -1) return;
    const root = file.types.find(({ name }) => name === segments.slice(0, first).join("."));
    const children = renamedFrom(root, segments.slice(first));
    if (children !== undefined) {
      const text = JSON.stringify([...segments.slice(0, first), ...children].join("."));
      edits.push({ start: path.span.start, end: path.span.end, text });
    }
    // A parent's key is its path of children from the root, then its state.
    const parents = member("parents");
    if (parents?.kind !== "object") return;
    for (const { key } of parents.members) {
      const parts = key.value.split(".");
      const renamed = renamedFrom(root, parts.slice(0, -1));
      if (renamed === undefined) continue;
      const text = JSON.stringify([...renamed, parts.at(-1)].join("."));
      edits.push({ start: key.span.start, end: key.span.end, text });
    }
  };
  const { root } = parseJson(source);
  if (root?.kind === "array") {
    for (const element of root.elements) {
      if (element.kind !== "object") continue;
      const found = element.members.find(({ key }) => key.value === "context");
      if (found !== undefined) context(found.value);
    }
  }
  return { source: replace(source, edits), changed: edits.length };
}

// Renames a type in stored records' contexts: the type a context's path
// starts with, or its type, when it is that type or one declared inside it.
// Data without problems.
export function renameTypeInData(
  source: string,
  type: Type,
  to: string,
): { source: string; changed: number } {
  const edits: { start: number; end: number; text: string }[] = [];
  const from = type.name;
  const renamed = type.scope === undefined ? to : `${type.scope}.${to}`;
  // A type's full name, renamed when it is that type or inside it.
  const rename = (name: string) =>
    name === from || name.startsWith(`${from}.`)
      ? `${renamed}${name.slice(from.length)}`
      : undefined;
  const context = (node: JsonNode) => {
    if (node.kind !== "object") return;
    const member = (name: string) => node.members.find(({ key }) => key.value === name)?.value;
    const path = member("path");
    if (path?.kind === "string") {
      const segments = path.value.split(".");
      const first = segments.findIndex((segment) => /^[a-z]/.test(segment));
      const root = segments.slice(0, first === -1 ? segments.length : first).join(".");
      const now = rename(root);
      if (now !== undefined) {
        const text = JSON.stringify(`${now}${path.value.slice(root.length)}`);
        edits.push({ start: path.span.start, end: path.span.end, text });
      }
    }
    const typeName = member("type");
    const now = typeName?.kind === "string" ? rename(typeName.value) : undefined;
    if (typeName !== undefined && now !== undefined) {
      edits.push({ start: typeName.span.start, end: typeName.span.end, text: JSON.stringify(now) });
    }
  };
  const { root } = parseJson(source);
  if (root?.kind === "array") {
    for (const element of root.elements) {
      if (element.kind !== "object") continue;
      const found = element.members.find(({ key }) => key.value === "context");
      if (found !== undefined) context(found.value);
    }
  }
  return { source: replace(source, edits), changed: edits.length };
}

// Renames a profile, or a modifier, in stored records' contexts: a profile is
// written first in a context's profile, and its modifiers after it, each
// after a "+". Data without problems.
export function renameProfileInData(
  source: string,
  kind: "profile" | "modifier",
  from: string,
  to: string,
): { source: string; changed: number } {
  const edits: { start: number; end: number; text: string }[] = [];
  const { root } = parseJson(source);
  if (root?.kind !== "array") return { source, changed: 0 };
  for (const element of root.elements) {
    if (element.kind !== "object") continue;
    const context = element.members.find(({ key }) => key.value === "context")?.value;
    if (context?.kind !== "object") continue;
    const profile = context.members.find(({ key }) => key.value === "profile")?.value;
    if (profile?.kind !== "string") continue;
    const parts = profile.value.split("+");
    const renamed = parts.map((part, index) =>
      part === from && (index === 0) === (kind === "profile") ? to : part,
    );
    if (renamed.every((part, index) => part === parts[index])) continue;
    edits.push({
      start: profile.span.start,
      end: profile.span.end,
      text: JSON.stringify(renamed.join("+")),
    });
  }
  return { source: replace(source, edits), changed: edits.length };
}

// Renames a dimension, or one of its values, in stored records' contexts:
// the dimension's key among a context's dimensions, or its value there. Data
// without problems.
export function renameDimensionInData(
  source: string,
  dimension: string,
  to: string,
  value?: string,
): { source: string; changed: number } {
  const edits: { start: number; end: number; text: string }[] = [];
  const { root } = parseJson(source);
  if (root?.kind !== "array") return { source, changed: 0 };
  for (const element of root.elements) {
    if (element.kind !== "object") continue;
    const context = element.members.find(({ key }) => key.value === "context")?.value;
    if (context?.kind !== "object") continue;
    const dimensions = context.members.find(({ key }) => key.value === "dimensions")?.value;
    if (dimensions?.kind !== "object") continue;
    for (const { key, value: given } of dimensions.members) {
      if (key.value !== dimension) continue;
      if (value === undefined) {
        edits.push({ start: key.span.start, end: key.span.end, text: JSON.stringify(to) });
      } else if (given.kind === "string" && given.value === value) {
        edits.push({ start: given.span.start, end: given.span.end, text: JSON.stringify(to) });
      }
    }
  }
  return { source: replace(source, edits), changed: edits.length };
}

// Renames an actor in stored records: each one it recorded, by its name.
// Data without problems.
export function renameActorInData(
  source: string,
  from: string,
  to: string,
): { source: string; changed: number } {
  const edits: { start: number; end: number; text: string }[] = [];
  const { root } = parseJson(source);
  if (root?.kind !== "array") return { source, changed: 0 };
  for (const element of root.elements) {
    if (element.kind !== "object") continue;
    const actor = element.members.find(({ key }) => key.value === "actor")?.value;
    if (actor?.kind !== "string" || actor.value !== from) continue;
    edits.push({ start: actor.span.start, end: actor.span.end, text: JSON.stringify(to) });
  }
  return { source: replace(source, edits), changed: edits.length };
}
