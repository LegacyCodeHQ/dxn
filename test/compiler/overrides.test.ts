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
    expect(overrides([])).toEqual([o("wrong-type", "$")]);
    expect(overrides({})).toEqual([o("missing-key", "$.version"), o("missing-key", "$.overrides")]);
    expect(overrides({ version: 1, overrides: {}, extra: 1 })).toEqual([
      o("unknown-key", "$.extra"),
    ]);
    expect(overrides({ version: 2, overrides: {} })).toEqual([
      o("unsupported-version", "$.version"),
    ]);
    expect(byValue([])).toEqual([o("wrong-type", "$.overrides")]);
  });

  it("may point editors at the JSON schema", () => {
    expect(overrides({ $schema: "x", version: 1, overrides: {} })).toEqual([]);
    expect(overrides({ $schema: 1, version: 1, overrides: {} })).toEqual([
      o("wrong-type", "$.$schema"),
    ]);
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

  it("target only types and tasks under a value", () => {
    expect(touch([])).toEqual([o("wrong-type", "$.overrides.touch")]);
    expect(touch({ screens: {} })).toEqual([o("unknown-key", "$.overrides.touch.screens")]);
    expect(touch({ types: [] })).toEqual([o("wrong-type", "$.overrides.touch.types")]);
    expect(touch({ tasks: [] })).toEqual([o("wrong-type", "$.overrides.touch.tasks")]);
  });
});

describe("type overrides", () => {
  const link = (entry: unknown) => touch({ types: { link: entry } });
  const base = "$.overrides.touch.types.link";

  it("must target a defined type with states and customAttributes only", () => {
    expect(touch({ types: { button: {} } })).toEqual([
      o("undefined-type", "$.overrides.touch.types.button"),
    ]);
    expect(link([])).toEqual([o("wrong-type", base)]);
    expect(link({ title: "x" })).toEqual([o("unknown-key", `${base}.title`)]);
  });

  it("remove and add states", () => {
    expect(link({ states: { remove: ["hovered"], add: ["pressed"] } })).toEqual([]);
  });

  it("change states with lists of valid names only", () => {
    expect(link({ states: [] })).toEqual([o("wrong-type", `${base}.states`)]);
    expect(link({ states: { rename: [] } })).toEqual([o("unknown-key", `${base}.states.rename`)]);
    expect(link({ states: { remove: "hovered" } })).toEqual([
      o("wrong-type", `${base}.states.remove`),
    ]);
    expect(link({ states: { add: [""] } })).toEqual([o("empty-string", `${base}.states.add[0]`)]);
    expect(link({ states: { add: [" pressed"] } })).toEqual([
      o("surrounding-whitespace", `${base}.states.add[0]`),
    ]);
    expect(link({ states: { add: ["p\u0002"] } })).toEqual([
      o("control-character", `${base}.states.add[0]`),
    ]);
  });

  it("remove only states the type has, once", () => {
    expect(link({ states: { remove: ["pressed"] } })).toEqual([
      o("unknown-state", `${base}.states.remove[0]`),
    ]);
    expect(link({ states: { remove: ["hovered", "hovered"] } })).toEqual([
      o("duplicate-state", `${base}.states.remove[1]`),
    ]);
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

describe("task overrides", () => {
  const base = "$.overrides.touch.tasks";

  it("override a typed task within the dimension's scope", () => {
    expect(
      touch({ tasks: { "blog-link": { customAttributes: { design: { normal: "missing" } } } } }),
    ).toEqual([]);
  });

  it("must target an existing task", () => {
    expect(touch({ tasks: { nope: {} } })).toEqual([o("unknown-task", `${base}.nope`)]);
  });

  it("must target a task the dimension applies to", () => {
    expect(touch({ tasks: { "footer-link": {} } })).toEqual([
      o("task-out-of-scope", `${base}.footer-link`),
    ]);
  });

  it("are not reported out of scope when appliesTo has errors", () => {
    expect(
      diagnose({
        ...tree,
        "dimensions/pointer.json": { ...pointer, appliesTo: ["nope"] },
        "overrides/pointer.json": {
          version: 1,
          overrides: { touch: { tasks: { "blog-link": {} } } },
        },
      }),
    ).toEqual([{ file: "dimensions/pointer.json", code: "unknown-task", path: "$.appliesTo[0]" }]);
  });

  it("require the task to have a type", () => {
    expect(touch({ tasks: { logo: {} } })).toEqual([o("override-without-type", `${base}.logo`)]);
  });

  it("start from the type's states after the type's override for the same value", () => {
    expect(
      touch({
        types: { link: { states: { remove: ["hovered"] } } },
        tasks: {
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
