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
    const snapshot: unknown[] = [];
    snapshot.push(declare({ "": { values: ["a"] } }));
    snapshot.push(declare({ " design": { values: ["a"] } }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "empty-string",
        "file": "types.json",
        "path": "$.customAttributes[""]",
      },
    ],
    [
      {
        "code": "surrounding-whitespace",
        "file": "types.json",
        "path": "$.customAttributes[" design"]",
      },
    ],
  ]
`);
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
    const snapshot: unknown[] = [];
    snapshot.push(declare({ design: { values: "x" } }));
    snapshot.push(declare({ design: { values: [] } }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "types.json",
        "path": "$.customAttributes.design.values",
      },
    ],
    [
      {
        "code": "empty-values",
        "file": "types.json",
        "path": "$.customAttributes.design.values",
      },
    ],
  ]
`);
  });

  it("require values to be valid unique names", () => {
    const snapshot: unknown[] = [];
    const value = (v: unknown) => declare({ design: { values: [v, "z"] } });
    const _path = "$.customAttributes.design.values[0]";
    snapshot.push(value(1));
    snapshot.push(value(""));
    snapshot.push(value("a "));
    snapshot.push(value("a\u0001"));
    snapshot.push(value("z"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "types.json",
        "path": "$.customAttributes.design.values[0]",
      },
    ],
    [
      {
        "code": "empty-string",
        "file": "types.json",
        "path": "$.customAttributes.design.values[0]",
      },
    ],
    [
      {
        "code": "surrounding-whitespace",
        "file": "types.json",
        "path": "$.customAttributes.design.values[0]",
      },
    ],
    [
      {
        "code": "control-character",
        "file": "types.json",
        "path": "$.customAttributes.design.values[0]",
      },
    ],
    [
      {
        "code": "duplicate-value",
        "file": "types.json",
        "path": "$.customAttributes.design.values[1]",
      },
    ],
  ]
`);
  });
});

describe("types", () => {
  const define = (typeMap: unknown) =>
    typesFile({ version: 1, customAttributes: declarations, types: typeMap });

  it("must be an object", () => {
    expect(define([])).toEqual([t("wrong-type", "$.types")]);
  });

  it("require type names to be non-blank without surrounding whitespace", () => {
    const snapshot: unknown[] = [];
    snapshot.push(define({ " ": {} }));
    snapshot.push(define({ "link ": {} }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "empty-string",
        "file": "types.json",
        "path": "$.types[" "]",
      },
    ],
    [
      {
        "code": "surrounding-whitespace",
        "file": "types.json",
        "path": "$.types["link "]",
      },
    ],
  ]
`);
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
    const snapshot: unknown[] = [];
    const _path = "$.types.link.states[0]";
    snapshot.push(states([1]));
    snapshot.push(states([""]));
    snapshot.push(states([" "]));
    snapshot.push(states([" normal"]));
    snapshot.push(states(["a\tb"]));
    snapshot.push(states(["a", "a"]));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "types.json",
        "path": "$.types.link.states[0]",
      },
    ],
    [
      {
        "code": "empty-string",
        "file": "types.json",
        "path": "$.types.link.states[0]",
      },
    ],
    [
      {
        "code": "empty-string",
        "file": "types.json",
        "path": "$.types.link.states[0]",
      },
    ],
    [
      {
        "code": "surrounding-whitespace",
        "file": "types.json",
        "path": "$.types.link.states[0]",
      },
    ],
    [
      {
        "code": "control-character",
        "file": "types.json",
        "path": "$.types.link.states[0]",
      },
    ],
    [
      {
        "code": "duplicate-state",
        "file": "types.json",
        "path": "$.types.link.states[1]",
      },
    ],
  ]
`);
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
    const snapshot: unknown[] = [];
    snapshot.push(values({ design: { normal: 1 } }));
    snapshot.push(values({ design: { normal: "maybe" } }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "types.json",
        "path": "$.types.link.customAttributes.design.normal",
      },
    ],
    [
      {
        "code": "unknown-value",
        "file": "types.json",
        "path": "$.types.link.customAttributes.design.normal",
      },
    ],
  ]
`);
  });
});

describe("customChecks declarations", () => {
  const declare = (customChecks: unknown) => typesFile({ version: 1, customChecks });

  it("declare each check as an empty object", () => {
    expect(declare({ visual: {}, behavior: {} })).toEqual([]);
  });

  it("must be an object of objects", () => {
    const snapshot: unknown[] = [];
    snapshot.push(declare([]));
    snapshot.push(declare({ visual: true }));
    snapshot.push(declare({ visual: { kind: 1 } }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "types.json",
        "path": "$.customChecks",
      },
    ],
    [
      {
        "code": "wrong-type",
        "file": "types.json",
        "path": "$.customChecks.visual",
      },
    ],
    [
      {
        "code": "unknown-key",
        "file": "types.json",
        "path": "$.customChecks.visual.kind",
      },
    ],
  ]
`);
  });

  it("require check names to be valid names", () => {
    const snapshot: unknown[] = [];
    snapshot.push(declare({ "": {} }));
    snapshot.push(declare({ "visual ": {} }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "empty-string",
        "file": "types.json",
        "path": "$.customChecks[""]",
      },
    ],
    [
      {
        "code": "surrounding-whitespace",
        "file": "types.json",
        "path": "$.customChecks["visual "]",
      },
    ],
  ]
`);
  });
});

describe("type checks", () => {
  const checks = (value: unknown) =>
    typesFile({ version: 1, customChecks: { visual: {} }, types: { link: { checks: value } } });

  it("list declared checks the type requires", () => {
    expect(checks(["visual"])).toEqual([]);
  });

  it("must be an array of valid unique names", () => {
    const snapshot: unknown[] = [];
    snapshot.push(checks("visual"));
    snapshot.push(checks([""]));
    snapshot.push(checks(["visual", "visual"]));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "types.json",
        "path": "$.types.link.checks",
      },
    ],
    [
      {
        "code": "empty-string",
        "file": "types.json",
        "path": "$.types.link.checks[0]",
      },
    ],
    [
      {
        "code": "duplicate-check",
        "file": "types.json",
        "path": "$.types.link.checks[1]",
      },
    ],
  ]
`);
  });

  it("must be declared", () => {
    expect(checks(["a11y"])).toEqual([t("undeclared-check", "$.types.link.checks[0]")]);
  });
});
