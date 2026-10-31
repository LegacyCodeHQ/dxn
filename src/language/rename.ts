import { type JsonNode, parseJson } from "../compiler/json.js";
import type { Located, ParseResult } from "./ast.js";
import { placement } from "./evaluate.js";
import { Names } from "./names.js";

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
// declaration, in every rule on a state of that enum, and in the branches of
// every derived state of that enum. A file without
// problems.
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
    }
    for (const child of type.children) {
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
