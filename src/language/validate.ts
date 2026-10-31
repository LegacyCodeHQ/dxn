import { childPath, type Diagnostic, Diagnostics } from "../compiler/diagnostic.js";
import { type JsonNode, parseJson } from "../compiler/json.js";
import type { ParseResult, RecordDeclaration } from "./ast.js";
import { article, Names } from "./names.js";

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

  const checkRecord = (node: JsonNode, name: string, path: string) => {
    const record = records.get(name) as RecordDeclaration;
    if (node.kind !== "object") {
      wrong(node, path, `${article(name)} ${name} record (an object)`);
      return;
    }
    const fields = record.fields.map((field) => field.name);
    for (const { key, value } of node.members) {
      const at = childPath(path, key.value);
      const field = record.fields.find((candidate) => candidate.name === key.value);
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

  // A field's value: a record, or one of an enum's values.
  const checkValue = (node: JsonNode, type: string, path: string) => {
    if (names.kindOf(type) === "record") {
      checkRecord(node, type, path);
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
      checkRecord(element, recordName, `$[${index}]`);
    });
  }
  return diagnostics.items.sort((a, b) => a.line - b.line || a.column - b.column);
}
