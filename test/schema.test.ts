import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { afterAll, describe, expect, it } from "vitest";
import { compile, compileDirectory } from "../src/compiler/compile.js";

// The schemas are editor aids; the compiler is the authority. These cases keep
// the two from drifting: whatever a schema can express, it must agree with.
const ajv = new Ajv2020({ allErrors: true });
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const validator = (name: string) => ajv.compile(readJson(`../schema/${name}.schema.json`));

const directories: string[] = [];
afterAll(() => {
  for (const directory of directories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function compileFiles(files: Record<string, unknown>): string[] {
  const directory = mkdtempSync(join(tmpdir(), "task-tree-schema-"));
  directories.push(directory);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(directory, name), JSON.stringify(content));
  }
  return compileDirectory(directory).diagnostics.map((d) => d.code);
}

type Case = [string, unknown];

// Valid documents pass both; structural errors (expressible in a schema) fail
// both; cross-reference errors pass the schema and only the compiler rejects them.
function agree(
  name: string,
  codes: (doc: unknown) => string[],
  cases: { valid: Case[]; structural: Case[]; crossReference: Case[] },
) {
  const validate = validator(name);
  describe(`${name} schema`, () => {
    it.each(cases.valid)("accepts %s, as the compiler does", (_, doc) => {
      expect(codes(doc)).toEqual([]);
      expect(validate(doc)).toBe(true);
    });

    it.each(cases.structural)("rejects %s, as the compiler does", (code, doc) => {
      expect(codes(doc)).toEqual([code]);
      expect(validate(doc)).toBe(false);
    });

    it.each(cases.crossReference)("accepts %s, which only the compiler rejects", (code, doc) => {
      expect(codes(doc)).toEqual([code]);
      expect(validate(doc)).toBe(true);
    });
  });
}

const declarations = { design: { values: ["available", "missing"] } };
const types = { link: { states: ["normal", "hovered", "selected"] } };
const base = { version: 1, customAttributes: declarations, types, tasks: [] };
const withTask = (task: unknown) => ({ ...base, tasks: [task] });
const withType = (type: unknown) => ({ ...base, types: { link: type } });
const withDeclaration = (declaration: unknown) => ({
  ...base,
  customAttributes: { design: declaration },
});

agree("tree", (doc) => compile(JSON.stringify(doc)).diagnostics.map((d) => d.code), {
  valid: [
    ["the smallest document", { version: 1, tasks: [] }],
    ["the article page example", readJson("../examples/article-page/tree.json")],
    ["a $schema reference", { $schema: "x", version: 1, tasks: [] }],
    ["a title with surrounding whitespace", withTask({ id: "a", title: " A " })],
    [
      "a type with values and an instance override",
      withTask({
        id: "a",
        title: "A",
        type: "link",
        customAttributes: { design: { selected: "available" } },
      }),
    ],
  ],
  structural: [
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
    ["empty-string", withTask({ id: "  ", title: "A" })],
    ["surrounding-whitespace", withTask({ id: "a ", title: "A" })],
    ["wrong-type", withTask({ id: "a", title: 1 })],
    ["empty-string", withTask({ id: "a", title: "" })],
    ["empty-string", withTask({ id: "a", title: " " })],
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
    ["surrounding-whitespace", withDeclaration({ values: [" a"] })],
    ["empty-string", { ...base, customAttributes: { "": { values: ["a"] } } }],
    ["surrounding-whitespace", { ...base, customAttributes: { "design ": { values: ["a"] } } }],
    ["wrong-type", { ...base, types: [] }],
    ["wrong-type", withType(1)],
    ["unknown-key", withType({ kind: "x" })],
    ["wrong-type", withType({ states: "x" })],
    ["wrong-type", withType({ states: [1] })],
    ["empty-string", withType({ states: [""] })],
    ["duplicate-state", withType({ states: ["a", "a"] })],
    ["surrounding-whitespace", withType({ states: [" a"] })],
    ["empty-string", { ...base, types: { " ": {} } }],
    ["surrounding-whitespace", { ...base, types: { "link ": {} } }],
    ["wrong-type", withType({ states: ["normal"], customAttributes: [] })],
    ["wrong-type", withType({ states: ["normal"], customAttributes: { design: "x" } })],
    ["wrong-type", withType({ states: ["normal"], customAttributes: { design: { normal: 1 } } })],
  ],
  crossReference: [
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
  ],
});

const tree = {
  ...base,
  tasks: [
    {
      id: "page",
      title: "Page",
      children: [
        { id: "blog-link", title: "Blog link", type: "link" },
        { id: "logo", title: "Logo" },
      ],
    },
    { id: "footer-link", title: "Footer link", type: "link" },
  ],
};
const dimensions = {
  version: 1,
  dimensions: { pointer: { values: ["mouse", "touch"], appliesTo: ["page"] } },
};
const dimension = (declaration: unknown) => ({
  version: 1,
  dimensions: { pointer: declaration },
});

agree("dimensions", (doc) => compileFiles({ "tree.json": tree, "dimensions.json": doc }), {
  valid: [
    ["no dimensions", { version: 1, dimensions: {} }],
    ["a dimension over existing tasks", dimensions],
    ["a $schema reference", { $schema: "x", ...dimensions }],
  ],
  structural: [
    ["wrong-type", []],
    ["missing-key", { version: 1 }],
    ["unknown-key", { ...dimensions, extra: 1 }],
    ["wrong-type", { $schema: 1, ...dimensions }],
    ["wrong-type", { version: "1", dimensions: {} }],
    ["unsupported-version", { version: 2, dimensions: {} }],
    ["wrong-type", { version: 1, dimensions: [] }],
    ["wrong-type", dimension("x")],
    ["missing-key", dimension({ values: ["mouse"] })],
    ["unknown-key", dimension({ values: ["mouse"], appliesTo: ["page"], kind: 1 })],
    ["wrong-type", dimension({ values: "x", appliesTo: ["page"] })],
    ["empty-values", dimension({ values: [], appliesTo: ["page"] })],
    ["wrong-type", dimension({ values: [1], appliesTo: ["page"] })],
    ["empty-string", dimension({ values: [""], appliesTo: ["page"] })],
    ["duplicate-value", dimension({ values: ["a", "a"], appliesTo: ["page"] })],
    ["empty-string", dimension({ values: [" "], appliesTo: ["page"] })],
    ["surrounding-whitespace", dimension({ values: ["sm "], appliesTo: ["page"] })],
    [
      "empty-string",
      { version: 1, dimensions: { "": { values: ["mouse"], appliesTo: ["page"] } } },
    ],
    [
      "surrounding-whitespace",
      { version: 1, dimensions: { " pointer": { values: ["mouse"], appliesTo: ["page"] } } },
    ],
    ["wrong-type", dimension({ values: ["mouse"], appliesTo: "page" })],
    ["empty-applies-to", dimension({ values: ["mouse"], appliesTo: [] })],
    ["wrong-type", dimension({ values: ["mouse"], appliesTo: [1] })],
    ["empty-string", dimension({ values: ["mouse"], appliesTo: [""] })],
    ["duplicate-task", dimension({ values: ["mouse"], appliesTo: ["page", "page"] })],
  ],
  crossReference: [["unknown-task", dimension({ values: ["mouse"], appliesTo: ["nope"] })]],
});

const overrides = (value: unknown) => ({ version: 1, overrides: value });
const touch = (entry: unknown) => overrides({ pointer: { touch: entry } });
const link = (entry: unknown) => touch({ types: { link: entry } });
const task = (id: string, entry: unknown) => touch({ tasks: { [id]: entry } });

agree(
  "overrides",
  (doc) =>
    compileFiles({ "tree.json": tree, "dimensions.json": dimensions, "overrides.json": doc }),
  {
    valid: [
      ["no overrides", overrides({})],
      ["the article page example", readJson("../examples/article-page/overrides.json")],
      ["a $schema reference", { $schema: "x", ...overrides({}) }],
      [
        "type and task overrides",
        touch({
          types: { link: { states: { remove: ["hovered"], add: ["pressed"] } } },
          tasks: { "blog-link": { customAttributes: { design: { pressed: "missing" } } } },
        }),
      ],
    ],
    structural: [
      ["wrong-type", []],
      ["missing-key", { version: 1 }],
      ["unknown-key", { ...overrides({}), extra: 1 }],
      ["wrong-type", { $schema: 1, ...overrides({}) }],
      ["wrong-type", { version: "1", overrides: {} }],
      ["unsupported-version", { version: 2, overrides: {} }],
      ["wrong-type", overrides([])],
      ["wrong-type", overrides({ pointer: [] })],
      ["wrong-type", touch([])],
      ["unknown-key", touch({ screens: {} })],
      ["wrong-type", touch({ types: [] })],
      ["wrong-type", touch({ tasks: [] })],
      ["wrong-type", link([])],
      ["unknown-key", link({ title: "x" })],
      ["wrong-type", link({ states: [] })],
      ["unknown-key", link({ states: { rename: [] } })],
      ["wrong-type", link({ states: { remove: "hovered" } })],
      ["wrong-type", link({ states: { add: [1] } })],
      ["empty-string", link({ states: { add: [""] } })],
      ["surrounding-whitespace", link({ states: { add: [" pressed"] } })],
      ["duplicate-state", link({ states: { remove: ["hovered", "hovered"] } })],
      ["wrong-type", link({ customAttributes: [] })],
      ["wrong-type", link({ customAttributes: { design: "x" } })],
      ["wrong-type", link({ customAttributes: { design: { normal: 1 } } })],
    ],
    crossReference: [
      ["undeclared-dimension", overrides({ theme: {} })],
      ["unknown-dimension-value", overrides({ pointer: { pen: {} } })],
      ["undefined-type", touch({ types: { button: {} } })],
      ["unknown-task", task("nope", {})],
      ["task-out-of-scope", task("footer-link", {})],
      ["override-without-type", task("logo", {})],
      ["unknown-state", link({ states: { remove: ["pressed"] } })],
      ["duplicate-state", link({ states: { add: ["normal"] } })],
      ["conflicting-state", link({ states: { remove: ["hovered"], add: ["hovered"] } })],
      [
        "removed-state",
        link({ states: { remove: ["hovered"] }, customAttributes: { design: { hovered: "x" } } }),
      ],
      ["undeclared-attribute", link({ customAttributes: { implemented: {} } })],
      ["unknown-value", link({ customAttributes: { design: { normal: "maybe" } } })],
    ],
  },
);

describe("article page example", () => {
  it.each(["tree", "dimensions", "overrides"])("%s.json passes its schema", (name) => {
    const validate = validator(name);
    expect(validate(readJson(`../examples/article-page/${name}.json`))).toBe(true);
    expect(validate.errors ?? []).toEqual([]);
  });
});
