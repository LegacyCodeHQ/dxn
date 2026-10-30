import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { compile } from "../src/compiler/compile.js";

// The schema is an editor aid; the compiler is the authority. These cases keep
// the two from drifting: whatever the schema can express, it must agree with.
const schema = JSON.parse(
  readFileSync(new URL("../schema/tree.schema.json", import.meta.url), "utf8"),
);
const validate = new Ajv2020({ allErrors: true }).compile(schema);

const example = JSON.parse(
  readFileSync(new URL("../examples/article-page/tree.json", import.meta.url), "utf8"),
);
const declarations = { design: { values: ["available", "missing"] } };
const types = { link: { states: ["normal", "hovered", "selected"] } };
const base = { version: 1, customAttributes: declarations, types, tasks: [] };
const withTask = (task: unknown) => ({ ...base, tasks: [task] });
const withType = (type: unknown) => ({ ...base, types: { link: type } });
const withDeclaration = (declaration: unknown) => ({
  ...base,
  customAttributes: { design: declaration },
});

const valid: [string, unknown][] = [
  ["the smallest document", { version: 1, tasks: [] }],
  ["the article page example", example],
  ["a $schema reference", { $schema: "x", version: 1, tasks: [] }],
  [
    "a type with values and an instance override",
    withTask({
      id: "a",
      title: "A",
      type: "link",
      customAttributes: { design: { selected: "available" } },
    }),
  ],
];

// Errors the schema can express: both must reject them.
const structural: [string, unknown][] = [
  ["wrong-type", []],
  ["missing-key", { tasks: [] }],
  ["unknown-key", { version: 1, tasks: [], extra: 1 }],
  ["wrong-type", { $schema: 1, version: 1, tasks: [] }],
  ["wrong-type", { version: "1", tasks: [] }],
  ["unsupported-version", { version: 2, tasks: [] }],
  ["wrong-type", { version: 1, tasks: {} }],
  ["wrong-type", { version: 1, tasks: [1] }],
  ["missing-key", withTask({ id: "a" })],
  ["unknown-key", withTask({ id: "a", title: "A", design: {} })],
  ["wrong-type", withTask({ id: 1, title: "A" })],
  ["empty-string", withTask({ id: "", title: "A" })],
  ["wrong-type", withTask({ id: "a", title: 1 })],
  ["empty-string", withTask({ id: "a", title: "" })],
  ["wrong-type", withTask({ id: "a", title: "A", type: 1 })],
  ["wrong-type", withTask({ id: "a", title: "A", children: {} })],
  ["attributes-without-type", withTask({ id: "a", title: "A", customAttributes: {} })],
  ["wrong-type", { ...base, customAttributes: [] }],
  ["wrong-type", withDeclaration("x")],
  ["missing-key", withDeclaration({})],
  ["unknown-key", withDeclaration({ values: ["a"], color: 1 })],
  ["wrong-type", withDeclaration({ values: "x" })],
  ["empty-values", withDeclaration({ values: [] })],
  ["wrong-type", withDeclaration({ values: [1] })],
  ["empty-string", withDeclaration({ values: [""] })],
  ["duplicate-value", withDeclaration({ values: ["a", "a"] })],
  ["wrong-type", { ...base, types: [] }],
  ["wrong-type", withType(1)],
  ["unknown-key", withType({ kind: "x" })],
  ["wrong-type", withType({ states: "x" })],
  ["wrong-type", withType({ states: [1] })],
  ["empty-string", withType({ states: [""] })],
  ["duplicate-state", withType({ states: ["a", "a"] })],
  ["wrong-type", withType({ states: ["normal"], customAttributes: [] })],
  ["wrong-type", withType({ states: ["normal"], customAttributes: { design: "x" } })],
  ["wrong-type", withType({ states: ["normal"], customAttributes: { design: { normal: 1 } } })],
];

// Cross-reference errors the schema cannot express: only the compiler rejects them.
const crossReference: [string, unknown][] = [
  ["duplicate-id", withTask({ id: "a", title: "A", children: [{ id: "a", title: "B" }] })],
  ["undefined-type", withTask({ id: "a", title: "A", type: "button" })],
  [
    "undeclared-attribute",
    withTask({ id: "a", title: "A", type: "link", customAttributes: { implemented: {} } }),
  ],
  [
    "unknown-state",
    withTask({
      id: "a",
      title: "A",
      type: "link",
      customAttributes: { design: { pressed: "available" } },
    }),
  ],
  [
    "unknown-value",
    withTask({
      id: "a",
      title: "A",
      type: "link",
      customAttributes: { design: { normal: "maybe" } },
    }),
  ],
];

function codes(doc: unknown): string[] {
  return compile(JSON.stringify(doc)).diagnostics.map((d) => d.code);
}

describe("JSON schema", () => {
  it.each(valid)("accepts %s, as the compiler does", (_, doc) => {
    expect(codes(doc)).toEqual([]);
    expect(validate(doc)).toBe(true);
  });

  it.each(structural)("rejects %s, as the compiler does", (code, doc) => {
    expect(codes(doc)).toEqual([code]);
    expect(validate(doc)).toBe(false);
  });

  it.each(crossReference)("accepts %s, which only the compiler rejects", (code, doc) => {
    expect(codes(doc)).toEqual([code]);
    expect(validate(doc)).toBe(true);
  });
});
