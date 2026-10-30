import { afterAll, describe, expect, it } from "vitest";
import { at, cleanup, compileFiles, diagnose } from "../support/project.js";

afterAll(cleanup);

const t = at("types.json");
const typesFile = (doc: unknown) => diagnose({ "types.json": doc });
const declarations = { design: { values: ["available", "missing"] } };

describe("types.json", () => {
  it("accepts the smallest valid file", () => {
    expect(typesFile({ version: 1 })).toEqual([]);
  });

  it("must be an object", () => {
    expect(typesFile([])).toEqual([t("wrong-type", "$")]);
  });

  it("requires version", () => {
    expect(typesFile({})).toEqual([t("missing-key", "$.version")]);
  });

  it("rejects unknown keys, including tasks", () => {
    expect(typesFile({ version: 1, tasks: [] })).toEqual([t("unknown-key", "$.tasks")]);
  });

  it("reports the position and message of a diagnostic", () => {
    const result = compileFiles({ "types.json": '{\n  "version": 1,\n  "extra": true\n}' });
    expect(result.diagnostics).toEqual([
      {
        file: "types.json",
        code: "unknown-key",
        message: 'unknown key "extra"',
        path: "$.extra",
        line: 3,
        column: 3,
      },
    ]);
  });
});

describe("$schema", () => {
  it("may point editors at the JSON schema", () => {
    expect(typesFile({ $schema: "x", version: 1 })).toEqual([]);
  });

  it("must be a string", () => {
    expect(typesFile({ $schema: 1, version: 1 })).toEqual([t("wrong-type", "$.$schema")]);
  });
});

describe("version", () => {
  it("must be a number", () => {
    expect(typesFile({ version: "1" })).toEqual([t("wrong-type", "$.version")]);
  });

  it("must be 1", () => {
    expect(typesFile({ version: 2 })).toEqual([t("unsupported-version", "$.version")]);
  });
});

describe("customAttributes declarations", () => {
  const declare = (customAttributes: unknown) => typesFile({ version: 1, customAttributes });

  it("must be an object", () => {
    expect(declare([])).toEqual([t("wrong-type", "$.customAttributes")]);
  });

  it("require attribute names to be non-blank without surrounding whitespace", () => {
    expect(declare({ "": { values: ["a"] } })).toEqual([
      t("empty-string", '$.customAttributes[""]'),
    ]);
    expect(declare({ " design": { values: ["a"] } })).toEqual([
      t("surrounding-whitespace", '$.customAttributes[" design"]'),
    ]);
  });

  it("declare each attribute as an object", () => {
    expect(declare({ design: "x" })).toEqual([t("wrong-type", "$.customAttributes.design")]);
  });

  it("require values", () => {
    expect(declare({ design: {} })).toEqual([t("missing-key", "$.customAttributes.design.values")]);
  });

  it("reject unknown keys", () => {
    expect(declare({ design: { values: ["a"], color: 1 } })).toEqual([
      t("unknown-key", "$.customAttributes.design.color"),
    ]);
  });

  it("require values to be an array with at least one value", () => {
    expect(declare({ design: { values: "x" } })).toEqual([
      t("wrong-type", "$.customAttributes.design.values"),
    ]);
    expect(declare({ design: { values: [] } })).toEqual([
      t("empty-values", "$.customAttributes.design.values"),
    ]);
  });

  it("require values to be valid unique names", () => {
    const value = (v: unknown) => declare({ design: { values: [v, "z"] } });
    const path = "$.customAttributes.design.values[0]";
    expect(value(1)).toEqual([t("wrong-type", path)]);
    expect(value("")).toEqual([t("empty-string", path)]);
    expect(value("a ")).toEqual([t("surrounding-whitespace", path)]);
    expect(value("a\u0001")).toEqual([t("control-character", path)]);
    expect(value("z")).toEqual([t("duplicate-value", "$.customAttributes.design.values[1]")]);
  });
});

describe("types", () => {
  const define = (typeMap: unknown) =>
    typesFile({ version: 1, customAttributes: declarations, types: typeMap });

  it("must be an object", () => {
    expect(define([])).toEqual([t("wrong-type", "$.types")]);
  });

  it("require type names to be non-blank without surrounding whitespace", () => {
    expect(define({ " ": {} })).toEqual([t("empty-string", '$.types[" "]')]);
    expect(define({ "link ": {} })).toEqual([t("surrounding-whitespace", '$.types["link "]')]);
  });

  it("define each type as an object", () => {
    expect(define({ link: 1 })).toEqual([t("wrong-type", "$.types.link")]);
  });

  it("reject unknown keys", () => {
    expect(define({ link: { kind: "x" } })).toEqual([t("unknown-key", "$.types.link.kind")]);
  });
});

describe("type states", () => {
  const states = (value: unknown) => typesFile({ version: 1, types: { link: { states: value } } });

  it("may be empty", () => {
    expect(states([])).toEqual([]);
  });

  it("must be an array", () => {
    expect(states("x")).toEqual([t("wrong-type", "$.types.link.states")]);
  });

  it("must be valid unique names", () => {
    const path = "$.types.link.states[0]";
    expect(states([1])).toEqual([t("wrong-type", path)]);
    expect(states([""])).toEqual([t("empty-string", path)]);
    expect(states([" "])).toEqual([t("empty-string", path)]);
    expect(states([" normal"])).toEqual([t("surrounding-whitespace", path)]);
    expect(states(["a\tb"])).toEqual([t("control-character", path)]);
    expect(states(["a", "a"])).toEqual([t("duplicate-state", "$.types.link.states[1]")]);
  });
});

describe("type customAttributes", () => {
  const values = (customAttributes: unknown) =>
    typesFile({
      version: 1,
      customAttributes: declarations,
      types: { link: { states: ["normal", "hovered", "selected"], customAttributes } },
    });
  const path = "$.types.link.customAttributes";

  it("accept a value for each state", () => {
    expect(values({ design: { normal: "available", selected: "missing" } })).toEqual([]);
  });

  it("must be an object", () => {
    expect(values([])).toEqual([t("wrong-type", path)]);
  });

  it("must use declared attributes", () => {
    expect(values({ implemented: {} })).toEqual([t("undeclared-attribute", `${path}.implemented`)]);
  });

  it("map states to values with an object", () => {
    expect(values({ design: "available" })).toEqual([t("wrong-type", `${path}.design`)]);
  });

  it("must use the type's states", () => {
    expect(values({ design: { pressed: "available" } })).toEqual([
      t("unknown-state", `${path}.design.pressed`),
    ]);
  });

  it("must use declared values", () => {
    expect(values({ design: { normal: 1 } })).toEqual([t("wrong-type", `${path}.design.normal`)]);
    expect(values({ design: { normal: "maybe" } })).toEqual([
      t("unknown-value", `${path}.design.normal`),
    ]);
  });
});
