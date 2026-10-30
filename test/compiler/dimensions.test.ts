import { afterAll, describe, expect, it } from "vitest";
import { at, cleanup, diagnose, pointer, tree } from "../support/project.js";

afterAll(cleanup);

const _d = at("dimensions/pointer.json");
const dimension = (doc: unknown) => diagnose({ ...tree, "dimensions/pointer.json": doc });
const field = (key: string, value: unknown) => dimension({ ...pointer, [key]: value });

describe("dimension files", () => {
  it("accept values and the nodes they apply to", () => {
    expect(dimension(pointer)).toEqual([]);
  });

  it("must be an object with version, values and appliesTo", () => {
    const snapshot: unknown[] = [];
    snapshot.push(dimension([]));
    snapshot.push(dimension({}));
    snapshot.push(dimension({ ...pointer, extra: 1 }));
    snapshot.push(dimension({ ...pointer, version: 2 }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "dimensions/pointer.json",
        "path": "$",
      },
    ],
    [
      {
        "code": "missing-key",
        "file": "dimensions/pointer.json",
        "path": "$.version",
      },
      {
        "code": "missing-key",
        "file": "dimensions/pointer.json",
        "path": "$.values",
      },
      {
        "code": "missing-key",
        "file": "dimensions/pointer.json",
        "path": "$.appliesTo",
      },
    ],
    [
      {
        "code": "unknown-key",
        "file": "dimensions/pointer.json",
        "path": "$.extra",
      },
    ],
    [
      {
        "code": "unsupported-version",
        "file": "dimensions/pointer.json",
        "path": "$.version",
      },
    ],
  ]
`);
  });

  it("may point editors at the JSON schema", () => {
    const snapshot: unknown[] = [];
    snapshot.push(dimension({ $schema: "x", ...pointer }));
    snapshot.push(dimension({ $schema: 1, ...pointer }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [],
    [
      {
        "code": "wrong-type",
        "file": "dimensions/pointer.json",
        "path": "$.$schema",
      },
    ],
  ]
`);
  });

  it("are named after a valid dimension name", () => {
    for (const name of [" pointer", ""]) {
      const file = `dimensions/${name}.json`;
      expect(diagnose({ ...tree, [file]: pointer })).toEqual([
        { file, code: "invalid-file-name", path: "$" },
      ]);
    }
  });

  it("must not be named state, which contexts use for node states", () => {
    expect(diagnose({ ...tree, "dimensions/state.json": pointer })).toEqual([
      { file: "dimensions/state.json", code: "reserved-name", path: "$" },
    ]);
  });

  it("ignore files that are not .json", () => {
    expect(diagnose({ ...tree, "dimensions/README.md": "# notes" })).toEqual([]);
  });
});

describe("dimension values", () => {
  it("must be an array with at least one value", () => {
    const snapshot: unknown[] = [];
    snapshot.push(field("values", "x"));
    snapshot.push(field("values", []));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "dimensions/pointer.json",
        "path": "$.values",
      },
    ],
    [
      {
        "code": "empty-values",
        "file": "dimensions/pointer.json",
        "path": "$.values",
      },
    ],
  ]
`);
  });

  it("must be valid unique names", () => {
    const snapshot: unknown[] = [];
    const value = (v: unknown) => field("values", [v, "z"]);
    snapshot.push(value(1));
    snapshot.push(value(""));
    snapshot.push(value("  "));
    snapshot.push(value("sm "));
    snapshot.push(value("s\u0001m"));
    snapshot.push(value("z"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "dimensions/pointer.json",
        "path": "$.values[0]",
      },
    ],
    [
      {
        "code": "empty-string",
        "file": "dimensions/pointer.json",
        "path": "$.values[0]",
      },
    ],
    [
      {
        "code": "empty-string",
        "file": "dimensions/pointer.json",
        "path": "$.values[0]",
      },
    ],
    [
      {
        "code": "surrounding-whitespace",
        "file": "dimensions/pointer.json",
        "path": "$.values[0]",
      },
    ],
    [
      {
        "code": "control-character",
        "file": "dimensions/pointer.json",
        "path": "$.values[0]",
      },
    ],
    [
      {
        "code": "duplicate-value",
        "file": "dimensions/pointer.json",
        "path": "$.values[1]",
      },
    ],
  ]
`);
  });
});

describe("dimension appliesTo", () => {
  const appliesTo = (value: unknown) => field("appliesTo", value);

  it("may name nodes from any node file", () => {
    expect(appliesTo(["page", "footer-link"])).toEqual([]);
  });

  it("must be an array naming at least one node", () => {
    const snapshot: unknown[] = [];
    snapshot.push(appliesTo("page"));
    snapshot.push(appliesTo([]));
    snapshot.push(appliesTo([1]));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "dimensions/pointer.json",
        "path": "$.appliesTo",
      },
    ],
    [
      {
        "code": "empty-applies-to",
        "file": "dimensions/pointer.json",
        "path": "$.appliesTo",
      },
    ],
    [
      {
        "code": "wrong-type",
        "file": "dimensions/pointer.json",
        "path": "$.appliesTo[0]",
      },
    ],
  ]
`);
  });

  it("must name existing nodes, once each", () => {
    const snapshot: unknown[] = [];
    snapshot.push(appliesTo(["nope"]));
    snapshot.push(appliesTo(["page", "page"]));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "unknown-node",
        "file": "dimensions/pointer.json",
        "path": "$.appliesTo[0]",
      },
    ],
    [
      {
        "code": "duplicate-node",
        "file": "dimensions/pointer.json",
        "path": "$.appliesTo[1]",
      },
    ],
  ]
`);
  });
});

describe("dimension default", () => {
  it("may name one of the values", () => {
    expect(field("default", "touch")).toEqual([]);
  });

  it("must be a valid name among the values", () => {
    const snapshot: unknown[] = [];
    snapshot.push(field("default", 1));
    snapshot.push(field("default", ""));
    snapshot.push(field("default", "pen"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "dimensions/pointer.json",
        "path": "$.default",
      },
    ],
    [
      {
        "code": "empty-string",
        "file": "dimensions/pointer.json",
        "path": "$.default",
      },
    ],
    [
      {
        "code": "unknown-dimension-value",
        "file": "dimensions/pointer.json",
        "path": "$.default",
      },
    ],
  ]
`);
  });
});
