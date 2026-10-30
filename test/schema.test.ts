import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { afterAll, describe, expect, it } from "vitest";
import {
  cleanup,
  diagnose,
  type Files,
  pointer,
  taskFile,
  tree,
  types,
} from "./support/project.js";

// The schemas are editor aids; the compiler is the authority. These cases keep
// the two from drifting: whatever a schema can express, it must agree with.
afterAll(cleanup);

const ajv = new Ajv2020({ allErrors: true });
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const validator = (name: string) => ajv.compile(readJson(`../schema/${name}.schema.json`));

type Case = [string, unknown];

// Valid documents pass both; structural errors (expressible in a schema) fail
// both; cross-reference errors pass the schema and only the compiler rejects them.
function agree(
  name: string,
  project: (doc: unknown) => Files,
  cases: { valid: Case[]; structural: Case[]; crossReference: Case[] },
) {
  const validate = validator(name);
  const codes = (doc: unknown) => diagnose(project(doc)).map(({ code }) => code);
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

const withType = (type: unknown) => ({ ...types, types: { link: type } });
const withDeclaration = (declaration: unknown) => ({
  ...types,
  customAttributes: { design: declaration },
});

agree("types", (doc) => ({ "types.json": doc }), {
  valid: [
    ["the smallest file", { version: 1 }],
    [
      "checks declared and required by a type",
      { version: 1, customChecks: { visual: {} }, types: { link: { checks: ["visual"] } } },
    ],
    ["the website example", readJson("../examples/website/types.json")],
    ["a $schema reference", { $schema: "x", version: 1 }],
    [
      "a type with values",
      withType({ states: ["normal"], customAttributes: { design: { normal: "missing" } } }),
    ],
  ],
  structural: [
    ["wrong-type", []],
    ["missing-key", {}],
    ["unknown-key", { version: 1, tasks: [] }],
    ["wrong-type", { $schema: 1, version: 1 }],
    ["wrong-type", { version: "1" }],
    ["unsupported-version", { version: 2 }],
    ["wrong-type", { ...types, customAttributes: [] }],
    ["empty-string", { ...types, customAttributes: { "": { values: ["a"] } } }],
    ["surrounding-whitespace", { ...types, customAttributes: { "design ": { values: ["a"] } } }],
    ["wrong-type", withDeclaration("x")],
    ["missing-key", withDeclaration({})],
    ["unknown-key", withDeclaration({ values: ["a"], color: 1 })],
    ["wrong-type", withDeclaration({ values: "x" })],
    ["empty-values", withDeclaration({ values: [] })],
    ["wrong-type", withDeclaration({ values: [1] })],
    ["empty-string", withDeclaration({ values: [""] })],
    ["surrounding-whitespace", withDeclaration({ values: [" a"] })],
    ["control-character", withDeclaration({ values: ["a\u0001"] })],
    ["duplicate-value", withDeclaration({ values: ["a", "a"] })],
    ["wrong-type", { ...types, customChecks: [] }],
    ["wrong-type", { ...types, customChecks: { visual: true } }],
    ["unknown-key", { ...types, customChecks: { visual: { kind: 1 } } }],
    ["empty-string", { ...types, customChecks: { "": {} } }],
    ["wrong-type", withType({ checks: "visual" })],
    ["empty-string", withType({ checks: [""] })],
    [
      "duplicate-check",
      { ...types, customChecks: { a: {} }, types: { link: { checks: ["a", "a"] } } },
    ],
    ["wrong-type", { ...types, types: [] }],
    ["empty-string", { ...types, types: { " ": {} } }],
    ["surrounding-whitespace", { ...types, types: { "link ": {} } }],
    ["wrong-type", withType(1)],
    ["unknown-key", withType({ kind: "x" })],
    ["wrong-type", withType({ states: "x" })],
    ["wrong-type", withType({ states: [1] })],
    ["empty-string", withType({ states: [""] })],
    ["surrounding-whitespace", withType({ states: [" a"] })],
    ["duplicate-state", withType({ states: ["a", "a"] })],
    ["wrong-type", withType({ states: ["normal"], customAttributes: [] })],
    ["wrong-type", withType({ states: ["normal"], customAttributes: { design: "x" } })],
    ["wrong-type", withType({ states: ["normal"], customAttributes: { design: { normal: 1 } } })],
  ],
  crossReference: [
    ["undeclared-check", withType({ checks: ["visual"] })],
    ["undeclared-attribute", withType({ states: ["normal"], customAttributes: { size: {} } })],
    [
      "unknown-state",
      withType({ states: ["normal"], customAttributes: { design: { pressed: "missing" } } }),
    ],
    [
      "unknown-value",
      withType({ states: ["normal"], customAttributes: { design: { normal: "maybe" } } }),
    ],
  ],
});

const task = (value: unknown) => taskFile(value);
const a = (fields: Record<string, unknown> = {}) => task({ id: "a", title: "A", ...fields });

agree("task", (doc) => ({ "types.json": types, "tasks/a.json": doc }), {
  valid: [
    ["a root task", a()],
    ["a $schema reference", { $schema: "x", ...a() }],
    ["a title with surrounding whitespace", a({ title: " A " })],
    [
      "a typed task with an override and children",
      a({
        type: "link",
        customAttributes: { design: { selected: "available" } },
        children: [{ id: "b", title: "B" }],
      }),
    ],
  ],
  structural: [
    ["wrong-type", []],
    ["missing-key", { version: 1 }],
    ["unknown-key", { ...a(), extra: 1 }],
    ["wrong-type", { $schema: 1, ...a() }],
    ["wrong-type", { version: "1", task: { id: "a", title: "A" } }],
    ["unsupported-version", { version: 2, task: { id: "a", title: "A" } }],
    ["wrong-type", task([])],
    ["missing-key", task({ id: "a" })],
    ["unknown-key", a({ design: {} })],
    ["wrong-type", a({ id: 1 })],
    ["empty-string", a({ id: "" })],
    ["empty-string", a({ id: "  " })],
    ["surrounding-whitespace", a({ id: "a " })],
    ["control-character", a({ id: "a\u0000" })],
    ["wrong-type", a({ title: 1 })],
    ["empty-string", a({ title: "" })],
    ["empty-string", a({ title: " " })],
    ["control-character", a({ title: "A\u0007" })],
    ["wrong-type", a({ type: 1 })],
    ["wrong-type", a({ children: {} })],
    ["missing-key", a({ children: [{ id: "b" }] })],
    ["empty-string", a({ children: [{ include: "" }] })],
    ["include-at-root", task({ include: "x" })],
    ["attributes-without-type", a({ customAttributes: {} })],
    ["wrong-type", a({ type: "link", customAttributes: [] })],
    ["wrong-type", a({ type: "link", customAttributes: { design: { normal: 1 } } })],
  ],
  crossReference: [
    ["file-name-mismatch", task({ id: "b", title: "B" })],
    ["unknown-component", a({ children: [{ include: "footer" }] })],
    ["duplicate-id", a({ children: [{ id: "a", title: "Again" }] })],
    ["undefined-type", a({ type: "button" })],
    ["undeclared-attribute", a({ type: "link", customAttributes: { size: {} } })],
    ["unknown-state", a({ type: "link", customAttributes: { design: { pressed: "missing" } } })],
    ["unknown-value", a({ type: "link", customAttributes: { design: { normal: "maybe" } } })],
  ],
});

const toolbar = { version: 1, component: { id: "toolbar", title: "Toolbar" } };

agree("component", (doc) => ({ "types.json": types, "components/toolbar.json": doc }), {
  valid: [
    ["a component", toolbar],
    ["a $schema reference", { $schema: "x", ...toolbar }],
    [
      "a component with children",
      {
        version: 1,
        component: { id: "toolbar", title: "Toolbar", children: [{ id: "b", title: "B" }] },
      },
    ],
  ],
  structural: [
    ["wrong-type", []],
    ["missing-key", { version: 1 }],
    ["unknown-key", { ...toolbar, extra: 1 }],
    [
      "unknown-key",
      { version: 1, task: { id: "toolbar", title: "T" }, component: toolbar.component },
    ],
    ["wrong-type", { version: 1, component: [] }],
    ["missing-key", { version: 1, component: { id: "toolbar" } }],
    ["include-at-root", { version: 1, component: { include: "x" } }],
  ],
  crossReference: [
    ["file-name-mismatch", { version: 1, component: { id: "header", title: "Header" } }],
    [
      "include-cycle",
      { version: 1, component: { id: "toolbar", title: "T", children: [{ include: "toolbar" }] } },
    ],
  ],
});

const dimension = (fields: Record<string, unknown>) => ({ ...pointer, ...fields });

agree("dimension", (doc) => ({ ...tree, "dimensions/pointer.json": doc }), {
  valid: [
    ["a dimension over existing tasks", pointer],
    ["a $schema reference", { $schema: "x", ...pointer }],
  ],
  structural: [
    ["wrong-type", []],
    ["missing-key", { version: 1, values: ["mouse"] }],
    ["unknown-key", dimension({ extra: 1 })],
    ["wrong-type", dimension({ $schema: 1 })],
    ["wrong-type", dimension({ version: "1" })],
    ["unsupported-version", dimension({ version: 2 })],
    ["wrong-type", dimension({ values: "x" })],
    ["empty-values", dimension({ values: [] })],
    ["wrong-type", dimension({ values: [1] })],
    ["empty-string", dimension({ values: [" "] })],
    ["surrounding-whitespace", dimension({ values: ["sm "] })],
    ["control-character", dimension({ values: ["s\u0001m"] })],
    ["duplicate-value", dimension({ values: ["a", "a"] })],
    ["wrong-type", dimension({ appliesTo: "page" })],
    ["empty-applies-to", dimension({ appliesTo: [] })],
    ["wrong-type", dimension({ appliesTo: [1] })],
    ["empty-string", dimension({ appliesTo: [""] })],
    ["duplicate-task", dimension({ appliesTo: ["page", "page"] })],
  ],
  crossReference: [["unknown-task", dimension({ appliesTo: ["nope"] })]],
});

const overrides = (value: unknown) => ({ version: 1, overrides: value });
const touch = (entry: unknown) => overrides({ touch: entry });
const link = (entry: unknown) => touch({ types: { link: entry } });
const taskOverride = (id: string, entry: unknown) => touch({ tasks: { [id]: entry } });

agree(
  "overrides",
  (doc) => ({ ...tree, "dimensions/pointer.json": pointer, "overrides/pointer.json": doc }),
  {
    valid: [
      ["no overrides", overrides({})],
      ["the website pointer overrides", readJson("../examples/website/overrides/pointer.json")],
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
      ["control-character", link({ states: { add: ["p\u0002"] } })],
      ["duplicate-state", link({ states: { remove: ["hovered", "hovered"] } })],
      ["wrong-type", link({ customAttributes: [] })],
      ["wrong-type", link({ customAttributes: { design: "x" } })],
      ["wrong-type", link({ customAttributes: { design: { normal: 1 } } })],
    ],
    crossReference: [
      ["unknown-dimension-value", overrides({ pen: {} })],
      ["undefined-type", touch({ types: { button: {} } })],
      ["unknown-task", taskOverride("nope", {})],
      ["task-out-of-scope", taskOverride("footer-link", {})],
      ["override-without-type", taskOverride("logo", {})],
      ["unknown-state", link({ states: { remove: ["pressed"] } })],
      ["duplicate-state", link({ states: { add: ["normal"] } })],
      ["conflicting-state", link({ states: { remove: ["hovered"], add: ["hovered"] } })],
      [
        "removed-state",
        link({ states: { remove: ["hovered"] }, customAttributes: { design: { hovered: "x" } } }),
      ],
      ["undeclared-attribute", link({ customAttributes: { size: {} } })],
      ["unknown-value", link({ customAttributes: { design: { normal: "maybe" } } })],
    ],
  },
);

const smTouch = (body: unknown) => ({ version: 1, overrides: { sm: { touch: body } } });
const comboLink = (entry: unknown) => smTouch({ types: { link: entry } });

agree(
  "combination",
  (doc) => ({
    ...tree,
    "dimensions/breakpoint.json": { version: 1, values: ["sm", "lg"], appliesTo: ["page"] },
    "dimensions/pointer.json": pointer,
    "overrides/breakpoint+pointer.json": doc,
  }),
  {
    valid: [
      ["no overrides", { version: 1, overrides: {} }],
      ["a $schema reference", { $schema: "x", version: 1, overrides: {} }],
      [
        "type and task overrides for a combination",
        smTouch({
          types: { link: { states: { remove: ["hovered"] } } },
          tasks: { "blog-link": { customAttributes: { design: { normal: "missing" } } } },
        }),
      ],
    ],
    structural: [
      ["wrong-type", []],
      ["missing-key", { version: 1 }],
      ["unknown-key", { version: 1, overrides: {}, extra: 1 }],
      ["wrong-type", { $schema: 1, version: 1, overrides: {} }],
      ["unsupported-version", { version: 2, overrides: {} }],
      ["wrong-type", { version: 1, overrides: [] }],
      ["wrong-type", comboLink({ states: [] })],
      ["wrong-type", comboLink({ customAttributes: { design: { normal: 1 } } })],
    ],
    // The schema cannot tell nesting depth from the file name.
    crossReference: [
      ["unknown-dimension-value", { version: 1, overrides: { xs: {} } }],
      ["unknown-key", smTouch({ screens: {} })],
      ["undefined-type", smTouch({ types: { button: {} } })],
    ],
  },
);

const checked: Files = {
  ...tree,
  "types.json": {
    version: 1,
    customChecks: { visual: {}, a11y: {} },
    types: { link: { states: ["normal", "hovered"], checks: ["visual"] } },
  },
  "dimensions/pointer.json": pointer,
};
const record = (fields: Record<string, unknown> = {}) => ({
  task: "blog-link",
  context: { state: "normal", pointer: "mouse" },
  check: "visual",
  result: "passed",
  by: "agent",
  at: "2026-10-30T19:20:00Z",
  ...fields,
});
const records = (...entries: unknown[]) => ({ version: 1, records: entries });

agree("verification", (doc) => ({ ...checked, "verification/page.json": doc }), {
  valid: [
    ["no records", records()],
    ["a record with evidence", records(record({ evidence: "shots/a.png" }))],
    ["a $schema reference", { $schema: "x", ...records() }],
  ],
  structural: [
    ["wrong-type", []],
    ["missing-key", { version: 1 }],
    ["unknown-key", { ...records(), extra: 1 }],
    ["wrong-type", { $schema: 1, ...records() }],
    ["unsupported-version", { version: 2, records: [] }],
    ["wrong-type", { version: 1, records: {} }],
    ["wrong-type", records(1)],
    ["missing-key", records({ ...record(), by: undefined })],
    ["unknown-key", records(record({ note: "x" }))],
    ["wrong-type", records(record({ task: 1 }))],
    ["empty-string", records(record({ task: "" }))],
    ["wrong-type", records(record({ context: [] }))],
    ["wrong-type", records(record({ context: { state: "normal", pointer: 1 } }))],
    ["wrong-type", records(record({ check: 1 }))],
    ["unknown-result", records(record({ result: "ok" }))],
    ["empty-string", records(record({ by: " " }))],
    ["invalid-timestamp", records(record({ at: "yesterday" }))],
    ["empty-string", records(record({ evidence: "" }))],
  ],
  crossReference: [
    ["unknown-task", records(record({ task: "nope" }))],
    ["task-outside-file", records(record({ task: "footer-link", context: { state: "normal" } }))],
    ["verification-without-type", records(record({ task: "logo", context: { pointer: "mouse" } }))],
    ["missing-key", records(record({ context: { state: "normal" } }))],
    ["unknown-key", records(record({ context: { state: "normal", pointer: "mouse", x: "y" } }))],
    ["unknown-dimension-value", records(record({ context: { state: "normal", pointer: "pen" } }))],
    ["unknown-state", records(record({ context: { state: "pressed", pointer: "mouse" } }))],
    ["undeclared-check", records(record({ check: "speed" }))],
    ["check-not-required", records(record({ check: "a11y" }))],
    ["invalid-timestamp", records(record({ at: "2026-13-01T00:00:00Z" }))],
    ["duplicate-record", records(record(), record())],
  ],
});

describe("website example", () => {
  it.each([
    ["types", "types.json"],
    ["task", "tasks/article-page.json"],
    ["dimension", "dimensions/breakpoint.json"],
    ["dimension", "dimensions/pointer.json"],
    ["overrides", "overrides/pointer.json"],
    ["verification", "verification/article-page.json"],
  ])("passes the %s schema: %s", (schema, file) => {
    const validate = validator(schema);
    expect(validate(readJson(`../examples/website/${file}`))).toBe(true);
    expect(validate.errors ?? []).toEqual([]);
  });
});
