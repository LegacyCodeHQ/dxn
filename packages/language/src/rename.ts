import type { Located, ParseResult } from "./ast.js";
import { comparisons } from "./condition.js";
import { placement } from "./evaluate.js";
import { type JsonNode, parseJson } from "./json.js";
import { Names } from "./names.js";
import { treePaths } from "./status.js";

// What a value is written as: a letter or digit, then letters, digits and
// hyphens.
export const isValue = (text: string) => /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(text);

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
      for (const { state, from: source, map } of child.bindings ?? []) {
        const subject = type.states.find(({ name }) => name === source.name);
        const target = inner?.states.find(({ name }) => name === state.name);
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
          const state =
            place.parents.find((parent) => parent.key === key)?.state ??
            place.target.states.find(({ name }) => name === key);
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
