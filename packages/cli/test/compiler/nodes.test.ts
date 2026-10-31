import { afterAll, describe, expect, it } from "vitest";
import { at, cleanup, compileFiles, diagnose, rootFile, types } from "../support/project.js";

afterAll(cleanup);

const k = at("roots/a.json");
const file = (doc: unknown) => diagnose({ "types.json": types, "roots/a.json": doc });
const node = (value: unknown) => file(rootFile(value));

describe("node files", () => {
  it("accept one root named after the file", () => {
    expect(node({ id: "a", title: "A" })).toEqual([]);
  });

  it("must be an object with version and node", () => {
    const snapshot: unknown[] = [];
    snapshot.push(file([]));
    snapshot.push(file({}));
    snapshot.push(file({ ...rootFile({ id: "a", title: "A" }), extra: 1 }));
    snapshot.push(file({ version: 2, root: { id: "a", title: "A" } }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "roots/a.json",
        "path": "$",
      },
    ],
    [
      {
        "code": "missing-key",
        "file": "roots/a.json",
        "path": "$.version",
      },
      {
        "code": "missing-key",
        "file": "roots/a.json",
        "path": "$.root",
      },
    ],
    [
      {
        "code": "unknown-key",
        "file": "roots/a.json",
        "path": "$.extra",
      },
    ],
    [
      {
        "code": "unsupported-version",
        "file": "roots/a.json",
        "path": "$.version",
      },
    ],
  ]
`);
  });

  it("may point editors at the JSON schema", () => {
    const snapshot: unknown[] = [];
    snapshot.push(file({ $schema: "x", ...rootFile({ id: "a", title: "A" }) }));
    snapshot.push(file({ $schema: 1, ...rootFile({ id: "a", title: "A" }) }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [],
    [
      {
        "code": "wrong-type",
        "file": "roots/a.json",
        "path": "$.$schema",
      },
    ],
  ]
`);
  });

  it("hold the node as an object", () => {
    expect(node([])).toEqual([k("wrong-type", "$.root")]);
  });

  it("must be named after the root's id", () => {
    expect(node({ id: "b", title: "B" })).toEqual([k("file-name-mismatch", "$.root.id")]);
  });

  it("are returned in file name order", () => {
    const result = compileFiles({
      "types.json": types,
      "roots/b.json": rootFile({ id: "b", title: "B" }),
      "roots/a.json": rootFile({ id: "a", title: "A" }),
    });
    expect(result.project?.roots.map(({ id }) => id)).toEqual(["a", "b"]);
  });
});

describe("node", () => {
  it("requires id and title", () => {
    const snapshot: unknown[] = [];
    snapshot.push(node({ id: "a" }));
    snapshot.push(node({ title: "A" }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "missing-key",
        "file": "roots/a.json",
        "path": "$.root.title",
      },
    ],
    [
      {
        "code": "missing-key",
        "file": "roots/a.json",
        "path": "$.root.id",
      },
    ],
  ]
`);
  });

  it("rejects keys outside the core DSL", () => {
    expect(node({ id: "a", title: "A", design: {} })).toEqual([k("unknown-key", "$.root.design")]);
  });

  it("reports deeply nested nodes instead of crashing", () => {
    // Built as text: JSON.stringify itself overflows the stack at this depth.
    const depth = 5000;
    const open = '{ "id": "t", "title": "T", "children": ['.repeat(depth);
    const source = `{ "version": 1, "root": ${open}${"] }".repeat(depth)} }`;
    expect(diagnose({ "types.json": types, "roots/a.json": source })).toEqual([k("too-deep", "$")]);
  });
});

describe("node id", () => {
  const id = (value: unknown) => node({ id: value, title: "A" });

  it("must be a valid name", () => {
    const snapshot: unknown[] = [];
    snapshot.push(id(1));
    snapshot.push(id(""));
    snapshot.push(id("  "));
    snapshot.push(id("a "));
    snapshot.push(id("a\u0000"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "roots/a.json",
        "path": "$.root.id",
      },
    ],
    [
      {
        "code": "empty-string",
        "file": "roots/a.json",
        "path": "$.root.id",
      },
    ],
    [
      {
        "code": "empty-string",
        "file": "roots/a.json",
        "path": "$.root.id",
      },
    ],
    [
      {
        "code": "surrounding-whitespace",
        "file": "roots/a.json",
        "path": "$.root.id",
      },
    ],
    [
      {
        "code": "control-character",
        "file": "roots/a.json",
        "path": "$.root.id",
      },
    ],
  ]
`);
  });

  it("must be unique within a file", () => {
    expect(node({ id: "a", title: "A", children: [{ id: "a", title: "Again" }] })).toEqual([
      k("duplicate-id", "$.root.children[0].id"),
    ]);
  });

  it("must be unique across files, naming where it was first used", () => {
    const result = compileFiles({
      "types.json": types,
      "roots/a.json": rootFile({ id: "a", title: "A", children: [{ id: "x", title: "X" }] }),
      "roots/b.json": rootFile({ id: "b", title: "B", children: [{ id: "x", title: "X" }] }),
    });
    expect(result.diagnostics).toMatchObject([
      {
        file: "roots/b.json",
        code: "duplicate-id",
        path: "$.root.children[0].id",
        message: 'node id "x" is already used at roots/a.json $.root.children[0]',
      },
    ]);
  });
});

describe("node title", () => {
  const title = (value: unknown) => node({ id: "a", title: value });

  it("must be a non-blank string without control characters", () => {
    const snapshot: unknown[] = [];
    snapshot.push(title(1));
    snapshot.push(title(""));
    snapshot.push(title(" \t"));
    snapshot.push(title("A\u0007"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "roots/a.json",
        "path": "$.root.title",
      },
    ],
    [
      {
        "code": "empty-string",
        "file": "roots/a.json",
        "path": "$.root.title",
      },
    ],
    [
      {
        "code": "empty-string",
        "file": "roots/a.json",
        "path": "$.root.title",
      },
    ],
    [
      {
        "code": "control-character",
        "file": "roots/a.json",
        "path": "$.root.title",
      },
    ],
  ]
`);
  });

  it("may have surrounding whitespace", () => {
    expect(title(" A ")).toEqual([]);
  });
});

describe("node type", () => {
  it("must be a string", () => {
    expect(node({ id: "a", title: "A", type: 1 })).toEqual([k("wrong-type", "$.root.type")]);
  });

  it("must name a type in types.json", () => {
    expect(node({ id: "a", title: "A", type: "button" })).toEqual([
      k("undefined-type", "$.root.type"),
    ]);
  });
});

describe("node children", () => {
  it("must be an array", () => {
    expect(node({ id: "a", title: "A", children: {} })).toEqual([
      k("wrong-type", "$.root.children"),
    ]);
  });

  it("are checked as nodes", () => {
    expect(node({ id: "a", title: "A", children: [{ id: "b" }] })).toEqual([
      k("missing-key", "$.root.children[0].title"),
    ]);
  });
});

describe("node attributes", () => {
  const withAttributes = (attributes: unknown, type: unknown = "link") =>
    node({ id: "a", title: "A", type, attributes });
  const path = "$.root.attributes";

  it("override the type's values", () => {
    expect(withAttributes({ design: { selected: "available" } })).toEqual([]);
  });

  it("require the node to have a type", () => {
    expect(node({ id: "a", title: "A", attributes: { design: {} } })).toEqual([
      k("attributes-without-type", path),
    ]);
  });

  it("must use declared attributes, the type's states and declared values", () => {
    expect(
      withAttributes({ implemented: {}, design: { pressed: "available", normal: "maybe" } }),
    ).toEqual([
      k("undeclared-attribute", `${path}.implemented`),
      k("unknown-state", `${path}.design.pressed`),
      k("unknown-value", `${path}.design.normal`),
    ]);
  });

  it("are not checked against an undefined type", () => {
    expect(withAttributes({ design: { pressed: "available" } }, "button")).toEqual([
      k("undefined-type", "$.root.type"),
    ]);
  });
});
