import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { afterAll, describe, expect, it } from "vitest";
import {
  cleanup,
  diagnose,
  type Files,
  pointer,
  rootFile,
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
  attributes: { design: declaration },
});

agree("types", (doc) => ({ "types.json": doc }), {
  valid: [
    ["the smallest file", { version: 1 }],
    [
      "state groups used whole and in part",
      {
        version: 1,
        stateGroups: { interaction: ["normal", "hovered"], selection: ["no", "yes"] },
        types: {
          link: { stateGroups: ["interaction", "selection"] },
          logo: { stateGroups: { interaction: ["normal"] } },
        },
      },
    ],
    [
      "checks declared and required by a type",
      { version: 1, checks: { visual: {} }, types: { link: { checks: ["visual"] } } },
    ],
    ["the website example", readJson("../examples/website/types.json")],
    ["a $schema reference", { $schema: "x", version: 1 }],
    [
      "a type with values",
      withType({ states: ["normal"], attributes: { design: { normal: "missing" } } }),
    ],
  ],
  structural: [
    ["wrong-type", []],
    ["missing-key", {}],
    ["unknown-key", { version: 1, nodes: [] }],
    ["wrong-type", { $schema: 1, version: 1 }],
    ["wrong-type", { version: "1" }],
    ["unsupported-version", { version: 2 }],
    ["wrong-type", { ...types, attributes: [] }],
    ["empty-string", { ...types, attributes: { "": { values: ["a"] } } }],
    ["surrounding-whitespace", { ...types, attributes: { "design ": { values: ["a"] } } }],
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
    ["wrong-type", withType({ states: ["a"], shared: "yes" })],
    ["wrong-type", { ...types, stateGroups: [] }],
    ["empty-values", { ...types, stateGroups: { interaction: [] } }],
    ["duplicate-value", { ...types, stateGroups: { interaction: ["a", "a"] } }],
    ["wrong-type", withType({ stateGroups: "interaction" })],
    ["wrong-type", { ...types, checks: [] }],
    ["wrong-type", { ...types, checks: { visual: true } }],
    ["unknown-key", { ...types, checks: { visual: { kind: 1 } } }],
    ["empty-string", { ...types, checks: { "": {} } }],
    ["wrong-type", withType({ checks: "visual" })],
    ["empty-string", withType({ checks: [""] })],
    ["duplicate-check", { ...types, checks: { a: {} }, types: { link: { checks: ["a", "a"] } } }],
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
    ["wrong-type", withType({ states: ["normal"], attributes: [] })],
    ["wrong-type", withType({ states: ["normal"], attributes: { design: "x" } })],
    ["wrong-type", withType({ states: ["normal"], attributes: { design: { normal: 1 } } })],
  ],
  crossReference: [
    ["shared-without-states", withType({ shared: true })],
    ["undeclared-state-group", withType({ stateGroups: ["interaction"] })],
    ["reserved-name", { ...types, stateGroups: { state: ["a"] } }],
    ["undeclared-check", withType({ checks: ["visual"] })],
    ["undeclared-attribute", withType({ states: ["normal"], attributes: { size: {} } })],
    [
      "unknown-state",
      withType({ states: ["normal"], attributes: { design: { pressed: "missing" } } }),
    ],
    [
      "unknown-value",
      withType({ states: ["normal"], attributes: { design: { normal: "maybe" } } }),
    ],
  ],
});

const node = (value: unknown) => rootFile(value);
const a = (fields: Record<string, unknown> = {}) => node({ id: "a", title: "A", ...fields });

agree("root", (doc) => ({ "types.json": types, "roots/a.json": doc }), {
  valid: [
    ["a root", a()],
    ["a $schema reference", { $schema: "x", ...a() }],
    ["a title with surrounding whitespace", a({ title: " A " })],
    [
      "a typed node with an override and children",
      a({
        type: "link",
        attributes: { design: { selected: "available" } },
        children: [{ id: "b", title: "B" }],
      }),
    ],
  ],
  structural: [
    ["wrong-type", []],
    ["missing-key", { version: 1 }],
    ["unknown-key", { ...a(), extra: 1 }],
    ["wrong-type", { $schema: 1, ...a() }],
    ["wrong-type", { version: "1", root: { id: "a", title: "A" } }],
    ["unsupported-version", { version: 2, root: { id: "a", title: "A" } }],
    ["wrong-type", node([])],
    ["missing-key", node({ id: "a" })],
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
    ["include-at-root", node({ include: "x" })],
    ["attributes-without-type", a({ attributes: {} })],
    ["wrong-type", a({ onlyWhen: [] })],
    ["empty-only", a({ onlyWhen: { a: [] } })],
    ["wrong-type", a({ type: "link", attributes: [] })],
    ["wrong-type", a({ type: "link", attributes: { design: { normal: 1 } } })],
  ],
  crossReference: [
    ["file-name-mismatch", node({ id: "b", title: "B" })],
    ["unknown-fragment", a({ children: [{ include: "footer" }] })],
    ["not-an-ancestor", a({ children: [{ id: "b", title: "B", onlyWhen: { x: ["y"] } }] })],
    ["duplicate-id", a({ children: [{ id: "a", title: "Again" }] })],
    ["undefined-type", a({ type: "button" })],
    ["undeclared-attribute", a({ type: "link", attributes: { size: {} } })],
    ["unknown-state", a({ type: "link", attributes: { design: { pressed: "missing" } } })],
    ["unknown-value", a({ type: "link", attributes: { design: { normal: "maybe" } } })],
  ],
});

const toolbar = { version: 1, fragment: { id: "toolbar", title: "Toolbar" } };

agree("fragment", (doc) => ({ "types.json": types, "fragments/toolbar.json": doc }), {
  valid: [
    ["a fragment", toolbar],
    ["a $schema reference", { $schema: "x", ...toolbar }],
    [
      "a fragment with children",
      {
        version: 1,
        fragment: { id: "toolbar", title: "Toolbar", children: [{ id: "b", title: "B" }] },
      },
    ],
  ],
  structural: [
    ["wrong-type", []],
    ["missing-key", { version: 1 }],
    ["unknown-key", { ...toolbar, extra: 1 }],
    [
      "unknown-key",
      { version: 1, root: { id: "toolbar", title: "T" }, fragment: toolbar.fragment },
    ],
    ["wrong-type", { version: 1, fragment: [] }],
    ["missing-key", { version: 1, fragment: { id: "toolbar" } }],
    ["include-at-root", { version: 1, fragment: { include: "x" } }],
  ],
  crossReference: [
    ["file-name-mismatch", { version: 1, fragment: { id: "header", title: "Header" } }],
    [
      "include-cycle",
      { version: 1, fragment: { id: "toolbar", title: "T", children: [{ include: "toolbar" }] } },
    ],
  ],
});

const dimension = (fields: Record<string, unknown>) => ({ ...pointer, ...fields });

agree("dimension", (doc) => ({ ...tree, "dimensions/pointer.json": doc }), {
  valid: [
    ["a dimension over existing nodes", pointer],
    ["a $schema reference", { $schema: "x", ...pointer }],
    ["a default value", { ...pointer, default: "mouse" }],
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
    ["duplicate-node", dimension({ appliesTo: ["page", "page"] })],
    ["wrong-type", dimension({ default: 1 })],
    ["empty-string", dimension({ default: "" })],
  ],
  crossReference: [
    ["unknown-node", dimension({ appliesTo: ["nope"] })],
    ["unknown-dimension-value", dimension({ default: "pen" })],
  ],
});

const overrides = (value: unknown) => ({ version: 1, overrides: value });
const touch = (entry: unknown) => overrides({ touch: entry });
const link = (entry: unknown) => touch({ types: { link: entry } });
const nodeOverride = (id: string, entry: unknown) => touch({ nodes: { [id]: entry } });

agree(
  "overrides",
  (doc) => ({ ...tree, "dimensions/pointer.json": pointer, "overrides/pointer.json": doc }),
  {
    valid: [
      ["no overrides", overrides({})],
      ["the website pointer overrides", readJson("../examples/website/overrides/pointer.json")],
      ["a $schema reference", { $schema: "x", ...overrides({}) }],
      ["where nodes exist", { ...overrides({}), only: { "blog-link": ["touch"] } }],
      [
        "type and node overrides",
        touch({
          types: { link: { states: { remove: ["hovered"], add: ["pressed"] } } },
          nodes: { "blog-link": { attributes: { design: { pressed: "missing" } } } },
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
      ["wrong-type", touch({ nodes: [] })],
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
      ["wrong-type", link({ attributes: [] })],
      ["wrong-type", link({ attributes: { design: "x" } })],
      ["wrong-type", link({ attributes: { design: { normal: 1 } } })],
      ["wrong-type", { ...overrides({}), only: [] }],
      ["wrong-type", { ...overrides({}), only: { "blog-link": "touch" } }],
      ["empty-only", { ...overrides({}), only: { "blog-link": [] } }],
      ["duplicate-value", { ...overrides({}), only: { "blog-link": ["touch", "touch"] } }],
      ["empty-string", { ...overrides({}), only: { "blog-link": [""] } }],
    ],
    crossReference: [
      ["unknown-dimension-value", overrides({ pen: {} })],
      ["unknown-node", { ...overrides({}), only: { nope: ["touch"] } }],
      ["unknown-dimension-value", { ...overrides({}), only: { "blog-link": ["pen"] } }],
      ["undefined-type", touch({ types: { button: {} } })],
      ["unknown-node", nodeOverride("nope", {})],
      ["node-out-of-scope", nodeOverride("footer-link", {})],
      ["override-without-type", nodeOverride("logo", {})],
      ["unknown-state", link({ states: { remove: ["pressed"] } })],
      ["duplicate-state", link({ states: { add: ["normal"] } })],
      ["conflicting-state", link({ states: { remove: ["hovered"], add: ["hovered"] } })],
      [
        "removed-state",
        link({ states: { remove: ["hovered"] }, attributes: { design: { hovered: "x" } } }),
      ],
      ["undeclared-attribute", link({ attributes: { size: {} } })],
      ["unknown-value", link({ attributes: { design: { normal: "maybe" } } })],
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
        "type and node overrides for a combination",
        smTouch({
          types: { link: { states: { remove: ["hovered"] } } },
          nodes: { "blog-link": { attributes: { design: { normal: "missing" } } } },
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
      ["wrong-type", comboLink({ attributes: { design: { normal: 1 } } })],
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
    checks: { visual: {}, a11y: {} },
    types: { link: { states: ["normal", "hovered"], checks: ["visual"] } },
  },
  "dimensions/pointer.json": pointer,
};
const record = (fields: Record<string, unknown> = {}) => ({
  node: "blog-link",
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
    ["wrong-type", records(record({ node: 1 }))],
    ["empty-string", records(record({ node: "" }))],
    ["wrong-type", records(record({ context: [] }))],
    ["wrong-type", records(record({ context: { state: "normal", pointer: 1 } }))],
    ["wrong-type", records(record({ check: 1 }))],
    ["unknown-result", records(record({ result: "ok" }))],
    ["empty-string", records(record({ by: " " }))],
    ["invalid-timestamp", records(record({ at: "yesterday" }))],
    ["empty-string", records(record({ evidence: "" }))],
  ],
  crossReference: [
    ["unknown-node", records(record({ node: "nope" }))],
    ["node-outside-file", records(record({ node: "footer-link", context: { state: "normal" } }))],
    ["verification-without-type", records(record({ node: "logo", context: { pointer: "mouse" } }))],
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

const expectation = (fields: Record<string, unknown> = {}) => ({
  title: "The blog link can be hovered",
  node: "blog-link",
  some: { state: "hovered" },
  ...fields,
});
const expectationsFile = (...entries: unknown[]) => ({ version: 1, expectations: entries });

const withOnlyMouse = {
  ...tree,
  "dimensions/pointer.json": pointer,
  "overrides/pointer.json": { version: 1, only: { "blog-link": ["mouse"] }, overrides: {} },
};

agree("expectations", (doc) => ({ ...withOnlyMouse, "expectations.json": doc }), {
  valid: [
    ["no expectations", expectationsFile()],
    ["a some assertion", expectationsFile(expectation())],
    [
      "a then assertion over a subtree in a root",
      expectationsFile(
        expectation({
          some: undefined,
          node: "toolbar",
          subtree: true,
          root: "page",
          when: { state: "hovered" },
          then: { state: "hovered" },
        }),
      ),
    ],
    [
      "an exists assertion",
      expectationsFile(expectation({ some: undefined, when: { pointer: "mouse" }, exists: true })),
    ],
    ["a $schema reference", { $schema: "x", ...expectationsFile() }],
  ],
  structural: [
    ["wrong-type", []],
    ["missing-key", { version: 1 }],
    ["unknown-key", { ...expectationsFile(), extra: 1 }],
    ["unsupported-version", { version: 2, expectations: [] }],
    ["wrong-type", { version: 1, expectations: {} }],
    ["wrong-type", expectationsFile(1)],
    ["missing-key", expectationsFile({ node: "blog-link", exists: true })],
    ["missing-key", expectationsFile({ title: "No assertion", node: "blog-link" })],
    ["several-assertions", expectationsFile(expectation({ exists: true }))],
    ["unknown-key", expectationsFile(expectation({ count: 1 }))],
    ["empty-string", expectationsFile(expectation({ title: " " }))],
    ["wrong-type", expectationsFile(expectation({ subtree: "yes" }))],
    ["wrong-type", expectationsFile(expectation({ when: [] }))],
    ["wrong-type", expectationsFile(expectation({ some: { state: 1 } }))],
    ["wrong-type", expectationsFile(expectation({ some: undefined, exists: "yes" }))],
  ],
  crossReference: [
    ["unknown-node", expectationsFile(expectation({ node: "nope" }))],
    ["node-outside-root", expectationsFile(expectation({ root: "footer-link" }))],
    ["unknown-name", expectationsFile(expectation({ when: { keyboard: "none" } }))],
    ["unknown-value", expectationsFile(expectation({ some: { state: "pressed" } }))],
    [
      "expectation-failed",
      expectationsFile(expectation({ some: undefined, then: { state: "normal" } })),
    ],
    [
      "empty-expectation",
      expectationsFile(
        expectation({ when: { pointer: "touch" }, some: undefined, then: { state: "normal" } }),
      ),
    ],
  ],
});

const withPointer = {
  ...tree,
  "dimensions/pointer.json": pointer,
  "dimensions/size.json": { version: 1, values: ["sm", "lg"], appliesTo: ["page"] },
};
const profilesFile = (profiles: unknown) => ({ version: 1, profiles });

agree("profiles", (doc) => ({ ...withPointer, "profiles.json": doc }), {
  valid: [
    ["no profiles", profilesFile({})],
    ["two profiles", profilesFile({ phone: { pointer: "touch" }, laptop: { pointer: "mouse" } })],
    ["a $schema reference", { $schema: "x", ...profilesFile({}) }],
  ],
  structural: [
    ["wrong-type", []],
    ["missing-key", { version: 1 }],
    ["unknown-key", { ...profilesFile({}), extra: 1 }],
    ["unsupported-version", { version: 2, profiles: {} }],
    ["wrong-type", profilesFile([])],
    ["wrong-type", profilesFile({ phone: "touch" })],
    ["wrong-type", profilesFile({ phone: { pointer: 1 } })],
    ["empty-values", profilesFile({ phone: {} })],
    ["empty-string", profilesFile({ phone: { pointer: " " } })],
  ],
  crossReference: [
    ["undeclared-dimension", profilesFile({ phone: { theme: "dark" } })],
    ["unknown-dimension-value", profilesFile({ phone: { pointer: "pen" } })],
    [
      "duplicate-profile",
      profilesFile({ phone: { pointer: "touch" }, ipad: { pointer: "touch" } }),
    ],
    [
      "incomplete-profile",
      profilesFile({ phone: { pointer: "touch", size: "sm" }, laptop: { pointer: "mouse" } }),
    ],
  ],
});

describe("website example", () => {
  it.each([
    ["types", "types.json"],
    ["root", "roots/article-page.json"],
    ["dimension", "dimensions/breakpoint.json"],
    ["dimension", "dimensions/pointer.json"],
    ["overrides", "overrides/pointer.json"],
    ["verification", "verification/article-page.json"],
    ["expectations", "expectations.json"],
  ])("passes the %s schema: %s", (schema, file) => {
    const validate = validator(schema);
    expect(validate(readJson(`../examples/website/${file}`))).toBe(true);
    expect(validate.errors ?? []).toEqual([]);
  });
});
