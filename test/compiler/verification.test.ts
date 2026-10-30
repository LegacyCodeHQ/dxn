import { afterAll, describe, expect, it } from "vitest";
import {
  at,
  cleanup,
  compileFiles,
  diagnose,
  type Files,
  pointer,
  tree,
} from "../support/project.js";

afterAll(cleanup);

// Links need visual and behavior checks; pointer applies to the page subtree,
// and links have no hovered state on touch.
const project: Files = {
  ...tree,
  "types.json": {
    version: 1,
    checks: { visual: {}, behavior: {}, a11y: {} },
    types: { link: { states: ["normal", "hovered", "selected"], checks: ["visual", "behavior"] } },
  },
  "dimensions/pointer.json": pointer,
  "overrides/pointer.json": {
    version: 1,
    overrides: { touch: { types: { link: { states: { remove: ["hovered"] } } } } },
  },
};

const record = (fields: Record<string, unknown> = {}) => ({
  node: "blog-link",
  context: { state: "hovered", pointer: "mouse" },
  check: "visual",
  result: "passed",
  by: "agent",
  at: "2026-10-30T19:20:00Z",
  ...fields,
});

const v = at("verification/page.json");
const file = (doc: unknown, name = "page") =>
  diagnose({ ...project, [`verification/${name}.json`]: doc });
const records = (...entries: unknown[]) => file({ version: 1, records: entries });
const r = (fields: Record<string, unknown>) => records(record(fields));

describe("verification files", () => {
  it("accept records for nodes in the file's root", () => {
    expect(records(record(), record({ check: "behavior", evidence: "shots/a.png" }))).toEqual([]);
  });

  it("are returned by root", () => {
    const result = compileFiles({
      ...project,
      "verification/page.json": { version: 1, records: [record()] },
    });
    expect(result.project?.verification.page?.records).toEqual([record()]);
  });

  it("must be named after a root", () => {
    for (const name of ["nope", "toolbar"]) {
      expect(file({ version: 1, records: [] }, name)).toEqual([
        { file: `verification/${name}.json`, code: "unknown-root", path: "$" },
      ]);
    }
  });

  it("must be an object with version and records", () => {
    const snapshot: unknown[] = [];
    snapshot.push(file([]));
    snapshot.push(file({}));
    snapshot.push(file({ version: 1, records: [], extra: 1 }));
    snapshot.push(file({ version: 2, records: [] }));
    snapshot.push(file({ version: 1, records: {} }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "verification/page.json",
        "path": "$",
      },
    ],
    [
      {
        "code": "missing-key",
        "file": "verification/page.json",
        "path": "$.version",
      },
      {
        "code": "missing-key",
        "file": "verification/page.json",
        "path": "$.records",
      },
    ],
    [
      {
        "code": "unknown-key",
        "file": "verification/page.json",
        "path": "$.extra",
      },
    ],
    [
      {
        "code": "unsupported-version",
        "file": "verification/page.json",
        "path": "$.version",
      },
    ],
    [
      {
        "code": "wrong-type",
        "file": "verification/page.json",
        "path": "$.records",
      },
    ],
  ]
`);
  });

  it("may point editors at the JSON schema", () => {
    const snapshot: unknown[] = [];
    snapshot.push(file({ $schema: "x", version: 1, records: [] }));
    snapshot.push(file({ $schema: 1, version: 1, records: [] }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [],
    [
      {
        "code": "wrong-type",
        "file": "verification/page.json",
        "path": "$.$schema",
      },
    ],
  ]
`);
  });
});

describe("records", () => {
  it("must be objects with the required keys", () => {
    const snapshot: unknown[] = [];
    snapshot.push(records(1));
    snapshot.push(records({}));
    snapshot.push(r({ note: "x" }));

    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          {
            "code": "wrong-type",
            "file": "verification/page.json",
            "path": "$.records[0]",
          },
        ],
        [
          {
            "code": "missing-key",
            "file": "verification/page.json",
            "path": "$.records[0].node",
          },
          {
            "code": "missing-key",
            "file": "verification/page.json",
            "path": "$.records[0].check",
          },
          {
            "code": "missing-key",
            "file": "verification/page.json",
            "path": "$.records[0].result",
          },
          {
            "code": "missing-key",
            "file": "verification/page.json",
            "path": "$.records[0].by",
          },
          {
            "code": "missing-key",
            "file": "verification/page.json",
            "path": "$.records[0].at",
          },
          {
            "code": "missing-key",
            "file": "verification/page.json",
            "path": "$.records[0].context",
          },
        ],
        [
          {
            "code": "unknown-key",
            "file": "verification/page.json",
            "path": "$.records[0].note",
          },
        ],
      ]
    `);
  });

  it("are unique per node, context and check", () => {
    expect(records(record(), record({ context: { pointer: "mouse", state: "hovered" } }))).toEqual([
      v("duplicate-record", "$.records[1]"),
    ]);
  });
});

describe("record node", () => {
  it("must be a valid name of an existing node", () => {
    const snapshot: unknown[] = [];
    snapshot.push(r({ node: 1 }));
    snapshot.push(r({ node: "nope" }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "verification/page.json",
        "path": "$.records[0].node",
      },
    ],
    [
      {
        "code": "unknown-node",
        "file": "verification/page.json",
        "path": "$.records[0].node",
      },
    ],
  ]
`);
  });

  it("must be inside the file's root", () => {
    expect(r({ node: "footer-link", context: { state: "normal" } })).toEqual([
      v("node-outside-file", "$.records[0].node"),
    ]);
  });

  it("must have a type that requires checks", () => {
    expect(r({ node: "logo", context: { pointer: "mouse" } })).toEqual([
      v("verification-without-type", "$.records[0].node"),
    ]);
  });
});

describe("record context", () => {
  const context = (value: unknown) => r({ context: value });
  const path = "$.records[0].context";

  it("must be an object", () => {
    expect(context([])).toEqual([v("wrong-type", path)]);
  });

  it("must name the node's state and every dimension that applies to it", () => {
    const snapshot: unknown[] = [];
    snapshot.push(context({ pointer: "mouse" }));
    snapshot.push(context({ state: "normal" }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "missing-key",
        "file": "verification/page.json",
        "path": "$.records[0].context.state",
      },
    ],
    [
      {
        "code": "missing-key",
        "file": "verification/page.json",
        "path": "$.records[0].context.pointer",
      },
    ],
  ]
`);
  });

  it("must not name dimensions that do not apply to the node", () => {
    const snapshot: unknown[] = [];
    snapshot.push(context({ state: "normal", pointer: "mouse", theme: "dark" }));
    snapshot.push(
      diagnose({
        ...project,
        "verification/footer-link.json": {
          version: 1,
          records: [
            record({ node: "footer-link", context: { state: "normal", pointer: "mouse" } }),
          ],
        },
      }),
    );

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "unknown-key",
        "file": "verification/page.json",
        "path": "$.records[0].context.theme",
      },
    ],
    [
      {
        "code": "unknown-key",
        "file": "verification/footer-link.json",
        "path": "$.records[0].context.pointer",
      },
    ],
  ]
`);
  });

  it("must use declared dimension values", () => {
    const snapshot: unknown[] = [];
    snapshot.push(context({ state: "normal", pointer: 1 }));
    snapshot.push(context({ state: "normal", pointer: "pen" }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "verification/page.json",
        "path": "$.records[0].context.pointer",
      },
    ],
    [
      {
        "code": "unknown-dimension-value",
        "file": "verification/page.json",
        "path": "$.records[0].context.pointer",
      },
    ],
  ]
`);
  });

  it("must use a state the node has in that context", () => {
    const snapshot: unknown[] = [];
    snapshot.push(context({ state: 1, pointer: "mouse" }));
    snapshot.push(context({ state: "pressed", pointer: "mouse" }));
    snapshot.push(context({ state: "hovered", pointer: "touch" }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "verification/page.json",
        "path": "$.records[0].context.state",
      },
    ],
    [
      {
        "code": "unknown-state",
        "file": "verification/page.json",
        "path": "$.records[0].context.state",
      },
    ],
    [
      {
        "code": "removed-state",
        "file": "verification/page.json",
        "path": "$.records[0].context.state",
      },
    ],
  ]
`);
  });

  it("include states added in that context", () => {
    expect(
      diagnose({
        ...project,
        "overrides/pointer.json": {
          version: 1,
          overrides: { touch: { nodes: { "blog-link": { states: { add: ["pressed"] } } } } },
        },
        "verification/page.json": {
          version: 1,
          records: [record({ context: { state: "pressed", pointer: "touch" } })],
        },
      }),
    ).toEqual([]);
  });
});

describe("record context across dimensions", () => {
  it("let a node's state change beat type state changes from other dimensions", () => {
    // breakpoint sorts first: applying dimensions in name order would let
    // pointer's type removal undo blog-link's own re-add at sm.
    expect(
      diagnose({
        ...project,
        "dimensions/breakpoint.json": { version: 1, values: ["sm"], appliesTo: ["page"] },
        "overrides/breakpoint.json": {
          version: 1,
          overrides: {
            sm: {
              types: { link: { states: { remove: ["hovered"] } } },
              nodes: { "blog-link": { states: { add: ["hovered"] } } },
            },
          },
        },
        "verification/page.json": {
          version: 1,
          records: [record({ context: { state: "hovered", breakpoint: "sm", pointer: "touch" } })],
        },
      }),
    ).toEqual([]);
  });
});

describe("record context defaults", () => {
  const withDefault = (value: string, ...entries: unknown[]) =>
    diagnose({
      ...project,
      "dimensions/pointer.json": { ...pointer, default: value },
      "verification/page.json": { version: 1, records: entries },
    });

  it("fill in a dimension the context leaves out", () => {
    const snapshot: unknown[] = [];
    snapshot.push(withDefault("mouse", record({ context: { state: "hovered" } })));
    snapshot.push(withDefault("touch", record({ context: { state: "hovered" } })));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [],
    [
      {
        "code": "removed-state",
        "file": "verification/page.json",
        "path": "$.records[0].context.state",
      },
    ],
  ]
`);
  });

  it("make a left-out dimension the same context as its default", () => {
    expect(
      withDefault(
        "mouse",
        record({ context: { state: "hovered" } }),
        record({ context: { state: "hovered", pointer: "mouse" } }),
      ),
    ).toEqual([v("duplicate-record", "$.records[1]")]);
  });
});

describe("record check", () => {
  it("must be declared", () => {
    const snapshot: unknown[] = [];
    snapshot.push(r({ check: 1 }));
    snapshot.push(r({ check: "speed" }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [
      {
        "code": "wrong-type",
        "file": "verification/page.json",
        "path": "$.records[0].check",
      },
    ],
    [
      {
        "code": "undeclared-check",
        "file": "verification/page.json",
        "path": "$.records[0].check",
      },
    ],
  ]
`);
  });

  it("must be one the node's type requires", () => {
    expect(r({ check: "a11y" })).toEqual([v("check-not-required", "$.records[0].check")]);
  });
});

describe("record result, by, at and evidence", () => {
  it("result is passed or failed", () => {
    const snapshot: unknown[] = [];
    snapshot.push(r({ result: "failed" }));
    snapshot.push(r({ result: 1 }));
    snapshot.push(r({ result: "ok" }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [],
    [
      {
        "code": "wrong-type",
        "file": "verification/page.json",
        "path": "$.records[0].result",
      },
    ],
    [
      {
        "code": "unknown-result",
        "file": "verification/page.json",
        "path": "$.records[0].result",
      },
    ],
  ]
`);
  });

  it("by is a non-blank name", () => {
    const snapshot: unknown[] = [];
    snapshot.push(r({ by: "ragunath@legacycode.com" }));
    snapshot.push(r({ by: " " }));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    [],
    [
      {
        "code": "empty-string",
        "file": "verification/page.json",
        "path": "$.records[0].by",
      },
    ],
  ]
`);
  });

  it("at is an ISO 8601 date and time with a time zone", () => {
    const snapshot: unknown[] = [];
    snapshot.push(r({ at: "2026-10-30T19:20:00.123+05:30" }));
    snapshot.push(r({ at: 1 }));
    for (const value of [
      "yesterday",
      "2026-10-30",
      "2026-10-30T19:20:00",
      "2026-13-01T00:00:00Z",
    ]) {
      snapshot.push(r({ at: value }));
    }
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [],
        [
          {
            "code": "wrong-type",
            "file": "verification/page.json",
            "path": "$.records[0].at",
          },
        ],
        [
          {
            "code": "invalid-timestamp",
            "file": "verification/page.json",
            "path": "$.records[0].at",
          },
        ],
        [
          {
            "code": "invalid-timestamp",
            "file": "verification/page.json",
            "path": "$.records[0].at",
          },
        ],
        [
          {
            "code": "invalid-timestamp",
            "file": "verification/page.json",
            "path": "$.records[0].at",
          },
        ],
        [
          {
            "code": "invalid-timestamp",
            "file": "verification/page.json",
            "path": "$.records[0].at",
          },
        ],
      ]
    `);
  });

  it("evidence is optional and non-blank", () => {
    expect(r({ evidence: "" })).toEqual([v("empty-string", "$.records[0].evidence")]);
  });
});
