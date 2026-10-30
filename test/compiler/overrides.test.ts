import { afterAll, describe, expect, it } from "vitest";
import { at, cleanup, diagnose, pointer, tree } from "../support/project.js";

afterAll(cleanup);

const o = at("overrides/pointer.json");
const overrides = (doc: unknown) =>
  diagnose({ ...tree, "dimensions/pointer.json": pointer, "overrides/pointer.json": doc });
const byValue = (value: unknown) => overrides({ version: 1, overrides: value });
const touch = (entry: unknown) => byValue({ touch: entry });

describe("override files", () => {
  it("must be an object with version and overrides", () => {
    const snapshot: unknown[] = [];
    snapshot.push(overrides([]));
    snapshot.push(overrides({}));
    snapshot.push(overrides({ version: 1, overrides: {}, extra: 1 }));
    snapshot.push(overrides({ version: 2, overrides: {} }));
    snapshot.push(byValue([]));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "overrides/pointer.json",
        "path": "$",
      },
    ],
    [
      {
        "code": "missing-key",
        "file": "overrides/pointer.json",
        "path": "$.version",
      },
      {
        "code": "missing-key",
        "file": "overrides/pointer.json",
        "path": "$.overrides",
      },
    ],
    [
      {
        "code": "unknown-key",
        "file": "overrides/pointer.json",
        "path": "$.extra",
      },
    ],
    [
      {
        "code": "unsupported-version",
        "file": "overrides/pointer.json",
        "path": "$.version",
      },
    ],
    [
      {
        "code": "wrong-type",
        "file": "overrides/pointer.json",
        "path": "$.overrides",
      },
    ],
  ]
`);
  });

  it("may point editors at the JSON schema", () => {
    const snapshot: unknown[] = [];
    snapshot.push(overrides({ $schema: "x", version: 1, overrides: {} }));
    snapshot.push(overrides({ $schema: 1, version: 1, overrides: {} }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [],
    [
      {
        "code": "wrong-type",
        "file": "overrides/pointer.json",
        "path": "$.$schema",
      },
    ],
  ]
`);
  });

  it("must be named after a declared dimension", () => {
    expect(diagnose({ ...tree, "overrides/theme.json": { version: 1, overrides: {} } })).toEqual([
      { file: "overrides/theme.json", code: "undeclared-dimension", path: "$" },
    ]);
  });

  it("are not checked against a dimension file that does not parse", () => {
    expect(
      diagnose({
        ...tree,
        "dimensions/pointer.json": "{",
        "overrides/pointer.json": { version: 1, overrides: { anything: {} } },
      }),
    ).toEqual([{ file: "dimensions/pointer.json", code: "unexpected-end", path: "$" }]);
  });

  it("key overrides by the dimension's values", () => {
    expect(byValue({ pen: {} })).toEqual([o("unknown-dimension-value", "$.overrides.pen")]);
  });

  it("target only types and nodes under a value", () => {
    const snapshot: unknown[] = [];
    snapshot.push(touch([]));
    snapshot.push(touch({ screens: {} }));
    snapshot.push(touch({ types: [] }));
    snapshot.push(touch({ nodes: [] }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "overrides/pointer.json",
        "path": "$.overrides.touch",
      },
    ],
    [
      {
        "code": "unknown-key",
        "file": "overrides/pointer.json",
        "path": "$.overrides.touch.screens",
      },
    ],
    [
      {
        "code": "wrong-type",
        "file": "overrides/pointer.json",
        "path": "$.overrides.touch.types",
      },
    ],
    [
      {
        "code": "wrong-type",
        "file": "overrides/pointer.json",
        "path": "$.overrides.touch.nodes",
      },
    ],
  ]
`);
  });
});

describe("type overrides", () => {
  const link = (entry: unknown) => touch({ types: { link: entry } });
  const base = "$.overrides.touch.types.link";

  it("must target a defined type with states and customAttributes only", () => {
    const snapshot: unknown[] = [];
    snapshot.push(touch({ types: { button: {} } }));
    snapshot.push(link([]));
    snapshot.push(link({ title: "x" }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "undefined-type",
        "file": "overrides/pointer.json",
        "path": "$.overrides.touch.types.button",
      },
    ],
    [
      {
        "code": "wrong-type",
        "file": "overrides/pointer.json",
        "path": "$.overrides.touch.types.link",
      },
    ],
    [
      {
        "code": "unknown-key",
        "file": "overrides/pointer.json",
        "path": "$.overrides.touch.types.link.title",
      },
    ],
  ]
`);
  });

  it("remove and add states", () => {
    expect(link({ states: { remove: ["hovered"], add: ["pressed"] } })).toEqual([]);
  });

  it("change states with lists of valid names only", () => {
    const snapshot: unknown[] = [];
    snapshot.push(link({ states: [] }));
    snapshot.push(link({ states: { rename: [] } }));
    snapshot.push(link({ states: { remove: "hovered" } }));
    snapshot.push(link({ states: { add: [""] } }));
    snapshot.push(link({ states: { add: [" pressed"] } }));
    snapshot.push(link({ states: { add: ["p\u0002"] } }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "overrides/pointer.json",
        "path": "$.overrides.touch.types.link.states",
      },
    ],
    [
      {
        "code": "unknown-key",
        "file": "overrides/pointer.json",
        "path": "$.overrides.touch.types.link.states.rename",
      },
    ],
    [
      {
        "code": "wrong-type",
        "file": "overrides/pointer.json",
        "path": "$.overrides.touch.types.link.states.remove",
      },
    ],
    [
      {
        "code": "empty-string",
        "file": "overrides/pointer.json",
        "path": "$.overrides.touch.types.link.states.add[0]",
      },
    ],
    [
      {
        "code": "surrounding-whitespace",
        "file": "overrides/pointer.json",
        "path": "$.overrides.touch.types.link.states.add[0]",
      },
    ],
    [
      {
        "code": "control-character",
        "file": "overrides/pointer.json",
        "path": "$.overrides.touch.types.link.states.add[0]",
      },
    ],
  ]
`);
  });

  it("remove only states the type has, once", () => {
    const snapshot: unknown[] = [];
    snapshot.push(link({ states: { remove: ["pressed"] } }));
    snapshot.push(link({ states: { remove: ["hovered", "hovered"] } }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "unknown-state",
        "file": "overrides/pointer.json",
        "path": "$.overrides.touch.types.link.states.remove[0]",
      },
    ],
    [
      {
        "code": "duplicate-state",
        "file": "overrides/pointer.json",
        "path": "$.overrides.touch.types.link.states.remove[1]",
      },
    ],
  ]
`);
  });

  it("add only states the type does not have", () => {
    expect(link({ states: { add: ["normal"] } })).toEqual([
      o("duplicate-state", `${base}.states.add[0]`),
    ]);
  });

  it("do not add a state they remove", () => {
    expect(link({ states: { remove: ["hovered"], add: ["hovered"] } })).toEqual([
      o("conflicting-state", `${base}.states.add[0]`),
    ]);
  });

  it("set declared values for the states they leave and add", () => {
    expect(
      link({
        states: { remove: ["hovered"], add: ["pressed"] },
        customAttributes: { design: { normal: "missing", pressed: "missing" } },
      }),
    ).toEqual([]);
  });

  it("reject undeclared attributes, unknown states and undeclared values", () => {
    expect(
      link({
        customAttributes: { implemented: {}, design: { pressed: "missing", normal: "maybe" } },
      }),
    ).toEqual([
      o("undeclared-attribute", `${base}.customAttributes.implemented`),
      o("unknown-state", `${base}.customAttributes.design.pressed`),
      o("unknown-value", `${base}.customAttributes.design.normal`),
    ]);
  });

  it("reject values for a state they remove", () => {
    expect(
      link({
        states: { remove: ["hovered"] },
        customAttributes: { design: { hovered: "missing" } },
      }),
    ).toEqual([o("removed-state", `${base}.customAttributes.design.hovered`)]);
  });
});

describe("node overrides", () => {
  const base = "$.overrides.touch.nodes";

  it("override a typed node within the dimension's scope", () => {
    expect(
      touch({ nodes: { "blog-link": { customAttributes: { design: { normal: "missing" } } } } }),
    ).toEqual([]);
  });

  it("must target an existing node", () => {
    expect(touch({ nodes: { nope: {} } })).toEqual([o("unknown-node", `${base}.nope`)]);
  });

  it("must target a node the dimension applies to", () => {
    expect(touch({ nodes: { "footer-link": {} } })).toEqual([
      o("node-out-of-scope", `${base}.footer-link`),
    ]);
  });

  it("are not reported out of scope when appliesTo has errors", () => {
    expect(
      diagnose({
        ...tree,
        "dimensions/pointer.json": { ...pointer, appliesTo: ["nope"] },
        "overrides/pointer.json": {
          version: 1,
          overrides: { touch: { nodes: { "blog-link": {} } } },
        },
      }),
    ).toEqual([{ file: "dimensions/pointer.json", code: "unknown-node", path: "$.appliesTo[0]" }]);
  });

  it("require the node to have a type", () => {
    expect(touch({ nodes: { logo: {} } })).toEqual([o("override-without-type", `${base}.logo`)]);
  });

  it("start from the type's states after the type's override for the same value", () => {
    expect(
      touch({
        types: { link: { states: { remove: ["hovered"] } } },
        nodes: {
          "blog-link": {
            states: { remove: ["hovered"] },
            customAttributes: { design: { hovered: "missing" } },
          },
        },
      }),
    ).toEqual([
      o("removed-state", `${base}.blog-link.states.remove[0]`),
      o("removed-state", `${base}.blog-link.customAttributes.design.hovered`),
    ]);
  });
});
