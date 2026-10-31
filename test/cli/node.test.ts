import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { capture } from "../support/cli.js";
import { cleanup, type Files, rootFile, types, writeProject } from "../support/project.js";

afterAll(cleanup);

const typed = {
  version: 1,
  attributes: { design: { values: ["available", "missing"] } },
  types: { link: { states: ["normal", "hovered"] } },
};

function project(files: Files = {}) {
  const root = writeProject(
    Object.fromEntries(
      Object.entries({ "types.json": typed, ...files }).map(([name, content]) => [
        `.dimensions/${name}`,
        content,
      ]),
    ),
  );
  const run = (...argv: string[]) => capture(argv, root);
  const read = (name: string) =>
    JSON.parse(readFileSync(join(root, ".dimensions", name), "utf8")) as unknown;
  const exists = (name: string) => existsSync(join(root, ".dimensions", name));
  return { root, run, read, exists };
}

const page = (children: unknown[] = []) => rootFile({ id: "page", title: "Page", children });

describe("node add", () => {
  it("creates a page when there is no parent", () => {
    const snapshot: unknown[] = [];
    const { run, read } = project();
    const result = run("node", "add", "home", "--title", "Home page");
    snapshot.push(result.code);
    snapshot.push(JSON.parse(result.stdout));
    snapshot.push(read("roots/home.json"));

    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        {
          "removed": [],
          "written": [
            "roots/home.json",
          ],
        },
        {
          "root": {
            "id": "home",
            "title": "Home page",
          },
          "version": 1,
        },
      ]
    `);
  });

  it("adds a child, with a type, under a parent in any file", () => {
    const snapshot: unknown[] = [];
    const { run, read } = project({
      "roots/page.json": page([{ id: "toolbar", title: "Toolbar" }]),
    });
    snapshot.push(
      run(
        "node",
        "add",
        "blog-link",
        "--title",
        "Blog link",
        "--parent",
        "toolbar",
        "--type",
        "link",
      ).code,
    );
    snapshot.push(read("roots/page.json"));

    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        {
          "root": {
            "children": [
              {
                "children": [
                  {
                    "id": "blog-link",
                    "title": "Blog link",
                    "type": "link",
                  },
                ],
                "id": "toolbar",
                "title": "Toolbar",
              },
            ],
            "id": "page",
            "title": "Page",
          },
          "version": 1,
        },
      ]
    `);
  });

  it("adds into fragments", () => {
    const snapshot: unknown[] = [];
    const { run, read } = project({
      "fragments/toolbar.json": { version: 1, fragment: { id: "toolbar", title: "Toolbar" } },
    });
    snapshot.push(
      run("node", "add", "wordmark", "--title", "Wordmark", "--parent", "toolbar").code,
    );
    snapshot.push(read("fragments/toolbar.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "fragment": {
        "children": [
          {
            "id": "wordmark",
            "title": "Wordmark",
          },
        ],
        "id": "toolbar",
        "title": "Toolbar",
      },
      "version": 1,
    },
  ]
`);
  });

  it("refuses changes the compiler rejects, and writes nothing", () => {
    const snapshot: unknown[] = [];
    const { run, exists } = project({ "roots/page.json": page() });
    const duplicate = run("node", "add", "page", "--title", "Again", "--parent", "page");
    snapshot.push(duplicate.code);
    snapshot.push(duplicate.stderr);
    snapshot.push(run("node", "add", "x", "--title", "X", "--type", "button").stderr);
    snapshot.push(exists("roots/x.json"));

    expect(snapshot).toMatchInlineSnapshot(`
      [
        1,
        "<tmp>/.dimensions/roots/page.json:8:15: duplicate-id: node id "page" is already used at roots/page.json $.root
      ",
        "<tmp>/.dimensions/roots/x.json:6:13: undefined-type: type "button" is not defined
      ",
        false,
      ]
    `);
  });

  it("reports an unknown parent and usage errors", () => {
    const snapshot: unknown[] = [];
    const { run } = project();
    snapshot.push(run("node", "add", "x", "--title", "X", "--parent", "nope"));
    snapshot.push(run("node", "add", "x").code);
    snapshot.push(run("node", "add", "--title", "X").code);
    snapshot.push(run("node", "frobnicate").code);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    {
      "code": 1,
      "stderr": "dimensions: node not found: nope
  ",
      "stdout": "",
    },
    2,
    2,
    2,
  ]
`);
  });

  it("prints the files with --dry-run and writes nothing", () => {
    const snapshot: unknown[] = [];
    const { run, exists } = project();
    const result = run("node", "add", "home", "--title", "Home", "--dry-run");
    snapshot.push(result.code);
    snapshot.push(JSON.parse(result.stdout));
    snapshot.push(exists("roots/home.json"));

    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        {
          "dryRun": true,
          "removed": [],
          "written": {
            "roots/home.json": "{
        "version": 1,
        "root": {
          "id": "home",
          "title": "Home"
        }
      }
      ",
          },
        },
        false,
      ]
    `);
  });
});

describe("node set-title and set-type", () => {
  it("change the title and type", () => {
    const snapshot: unknown[] = [];
    const { run, read } = project({ "roots/page.json": page([{ id: "a", title: "A" }]) });
    snapshot.push(run("node", "set-title", "a", "Renamed").code);
    snapshot.push(run("node", "set-type", "a", "link").code);
    snapshot.push(read("roots/page.json"));
    snapshot.push(run("node", "set-type", "a", "--none").code);
    snapshot.push(read("roots/page.json"));

    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        0,
        {
          "root": {
            "children": [
              {
                "id": "a",
                "title": "Renamed",
                "type": "link",
              },
            ],
            "id": "page",
            "title": "Page",
          },
          "version": 1,
        },
        0,
        {
          "root": {
            "children": [
              {
                "id": "a",
                "title": "Renamed",
              },
            ],
            "id": "page",
            "title": "Page",
          },
          "version": 1,
        },
      ]
    `);
  });

  it("refuse to leave attributes without a type", () => {
    const snapshot: unknown[] = [];
    const { run } = project({
      "roots/page.json": page([
        { id: "a", title: "A", type: "link", attributes: { design: { normal: "missing" } } },
      ]),
    });
    const result = run("node", "set-type", "a", "--none");
    snapshot.push(result.code);
    snapshot.push(result.stderr);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    1,
    "<tmp>/.dimensions/roots/page.json:10:9: attributes-without-type: attributes on a node require the node to have a type
  ",
  ]
`);
  });
});

describe("node move", () => {
  it("moves a subtree to a new parent, across files", () => {
    const snapshot: unknown[] = [];
    const { run, read } = project({
      "roots/page.json": page([{ id: "a", title: "A", children: [{ id: "b", title: "B" }] }]),
      "roots/other.json": rootFile({ id: "other", title: "Other" }),
    });
    snapshot.push(run("node", "move", "a", "--parent", "other").code);
    snapshot.push(read("roots/page.json"));
    snapshot.push(read("roots/other.json"));

    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        {
          "root": {
            "children": [],
            "id": "page",
            "title": "Page",
          },
          "version": 1,
        },
        {
          "root": {
            "children": [
              {
                "children": [
                  {
                    "id": "b",
                    "title": "B",
                  },
                ],
                "id": "a",
                "title": "A",
              },
            ],
            "id": "other",
            "title": "Other",
          },
          "version": 1,
        },
      ]
    `);
  });

  it("refuses to move a node into its own subtree", () => {
    const { run } = project({
      "roots/page.json": page([{ id: "a", title: "A", children: [{ id: "b", title: "B" }] }]),
    });
    expect(run("node", "move", "a", "--parent", "b")).toMatchObject({
      code: 1,
      stderr: 'dimensions: cannot move "a" into its own subtree\n',
    });
  });

  it("turns a page into a child, removing its file", () => {
    const snapshot: unknown[] = [];
    const { run, exists } = project({
      "roots/page.json": page(),
      "roots/other.json": rootFile({ id: "other", title: "Other" }),
    });
    const result = run("node", "move", "other", "--parent", "page");
    snapshot.push(result.code);
    snapshot.push(JSON.parse(result.stdout));
    snapshot.push(exists("roots/other.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "removed": [
        "roots/other.json",
      ],
      "written": [
        "roots/page.json",
      ],
    },
    false,
  ]
`);
  });
});

describe("node rename", () => {
  it("updates every reference to the node", () => {
    const snapshot: unknown[] = [];
    const { run, read } = project({
      "roots/page.json": page([{ id: "a", title: "A", type: "link" }]),
      "dimensions/pointer.json": { version: 1, values: ["mouse", "touch"], appliesTo: ["a"] },
      "overrides/pointer.json": {
        version: 1,
        only: { a: ["mouse"] },
        overrides: { mouse: { nodes: { a: { states: { remove: ["hovered"] } } } } },
      },
      "actors.json": { version: 1, actors: { agent: {} } },
      "verification/page.json": { version: 1, records: [] },
    });
    snapshot.push(run("node", "rename", "a", "b").code);
    snapshot.push(read("roots/page.json"));
    snapshot.push(read("dimensions/pointer.json"));
    snapshot.push(read("overrides/pointer.json"));

    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        {
          "root": {
            "children": [
              {
                "id": "b",
                "title": "A",
                "type": "link",
              },
            ],
            "id": "page",
            "title": "Page",
          },
          "version": 1,
        },
        {
          "appliesTo": [
            "b",
          ],
          "values": [
            "mouse",
            "touch",
          ],
          "version": 1,
        },
        {
          "only": {
            "b": [
              "mouse",
            ],
          },
          "overrides": {
            "mouse": {
              "nodes": {
                "b": {
                  "states": {
                    "remove": [
                      "hovered",
                    ],
                  },
                },
              },
            },
          },
          "version": 1,
        },
      ]
    `);
  });

  it("renames a page's file and its verification file", () => {
    const snapshot: unknown[] = [];
    const { run, exists } = project({
      "roots/page.json": page(),
      "actors.json": { version: 1, actors: { agent: {} } },
      "verification/page.json": { version: 1, records: [] },
    });
    snapshot.push(run("node", "rename", "page", "home").code);
    snapshot.push(exists("roots/home.json"));
    snapshot.push(exists("verification/home.json"));
    snapshot.push(exists("roots/page.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    true,
    true,
    false,
  ]
`);
  });

  it("renames a fragment's file and the includes that use it", () => {
    const snapshot: unknown[] = [];
    const { run, read, exists } = project({
      "fragments/toolbar.json": { version: 1, fragment: { id: "toolbar", title: "Toolbar" } },
      "roots/page.json": page([{ include: "toolbar" }]),
    });
    snapshot.push(run("node", "rename", "toolbar", "header").code);
    snapshot.push(exists("fragments/toolbar.json"));
    snapshot.push(read("fragments/header.json"));
    snapshot.push(read("roots/page.json"));

    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        false,
        {
          "fragment": {
            "id": "header",
            "title": "Toolbar",
          },
          "version": 1,
        },
        {
          "root": {
            "children": [
              {
                "include": "header",
              },
            ],
            "id": "page",
            "title": "Page",
          },
          "version": 1,
        },
      ]
    `);
  });

  it("updates verification records", () => {
    const snapshot: unknown[] = [];
    const record = {
      node: "a",
      context: { state: "normal" },
      check: "visual",
      result: "passed",
      actor: "agent",
      at: "2026-10-30T19:20:00Z",
    };
    const { run, read } = project({
      "types.json": {
        version: 1,
        checks: { visual: {} },
        types: { link: { states: ["normal"], checks: ["visual"] } },
      },
      "roots/page.json": page([{ id: "a", title: "A", type: "link" }]),
      "actors.json": { version: 1, actors: { agent: {} } },
      "verification/page.json": { version: 1, records: [record] },
    });
    snapshot.push(run("node", "rename", "a", "b").code);
    snapshot.push(read("verification/page.json"));

    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        {
          "records": [
            {
              "actor": "agent",
              "at": "2026-10-30T19:20:00Z",
              "check": "visual",
              "context": {
                "state": "normal",
              },
              "node": "b",
              "result": "passed",
            },
          ],
          "version": 1,
        },
      ]
    `);
  });
});

describe("node remove", () => {
  it("removes a node and its subtree", () => {
    const snapshot: unknown[] = [];
    const { run, read } = project({
      "roots/page.json": page([{ id: "a", title: "A", children: [{ id: "b", title: "B" }] }]),
    });
    snapshot.push(run("node", "remove", "a").code);
    snapshot.push(read("roots/page.json"));

    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        {
          "root": {
            "children": [],
            "id": "page",
            "title": "Page",
          },
          "version": 1,
        },
      ]
    `);
  });

  it("removes a page's file", () => {
    const snapshot: unknown[] = [];
    const { run, exists } = project({ "roots/page.json": page() });
    snapshot.push(run("node", "remove", "page").code);
    snapshot.push(exists("roots/page.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    false,
  ]
`);
  });

  it("refuses while something refers to the node", () => {
    const snapshot: unknown[] = [];
    const { run, exists } = project({
      "roots/page.json": page([{ id: "a", title: "A" }]),
      "dimensions/pointer.json": { version: 1, values: ["mouse"], appliesTo: ["a"] },
    });
    const result = run("node", "remove", "a");
    snapshot.push(result.code);
    snapshot.push(result.stderr);
    snapshot.push(exists("roots/page.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    1,
    "<tmp>/.dimensions/dimensions/pointer.json:7:5: unknown-node: node "a" does not exist
  ",
    true,
  ]
`);
  });
});

describe("node set and unset", () => {
  it("set and clear an instance's attribute values", () => {
    const snapshot: unknown[] = [];
    const { run, read } = project({
      "roots/page.json": page([{ id: "a", title: "A", type: "link" }]),
    });
    snapshot.push(run("node", "set", "a", "design", "normal=missing", "hovered=available").code);
    snapshot.push(read("roots/page.json"));
    snapshot.push(run("node", "unset", "a", "design", "hovered").code);
    snapshot.push(read("roots/page.json"));
    snapshot.push(run("node", "unset", "a", "design").code);
    snapshot.push(read("roots/page.json"));

    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        {
          "root": {
            "children": [
              {
                "attributes": {
                  "design": {
                    "hovered": "available",
                    "normal": "missing",
                  },
                },
                "id": "a",
                "title": "A",
                "type": "link",
              },
            ],
            "id": "page",
            "title": "Page",
          },
          "version": 1,
        },
        0,
        {
          "root": {
            "children": [
              {
                "attributes": {
                  "design": {
                    "normal": "missing",
                  },
                },
                "id": "a",
                "title": "A",
                "type": "link",
              },
            ],
            "id": "page",
            "title": "Page",
          },
          "version": 1,
        },
        0,
        {
          "root": {
            "children": [
              {
                "id": "a",
                "title": "A",
                "type": "link",
              },
            ],
            "id": "page",
            "title": "Page",
          },
          "version": 1,
        },
      ]
    `);
  });

  it("refuse values the compiler rejects and malformed pairs", () => {
    const snapshot: unknown[] = [];
    const { run } = project({ "roots/page.json": page([{ id: "a", title: "A", type: "link" }]) });
    snapshot.push(run("node", "set", "a", "design", "normal=maybe").stderr);
    snapshot.push(run("node", "set", "a", "design", "normal").code);
    snapshot.push(run("node", "set", "a", "design").code);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    "<tmp>/.dimensions/roots/page.json:13:23: unknown-value: "maybe" is not a declared value of "design"
  ",
    2,
    2,
  ]
`);
  });
});

describe("projects with unreadable files", () => {
  it("are refused before any change", () => {
    const snapshot: unknown[] = [];
    const { run } = project({ "roots/page.json": "{" });
    snapshot.push(run("node", "add", "x", "--title", "X", "--parent", "page"));
    snapshot.push(
      run("node", "add", "x", "--title", "X", "--parent", "page", "--dir", "/nonexistent").code,
    );

    expect(snapshot).toMatchInlineSnapshot(`
  [
    {
      "code": 1,
      "stderr": "dimensions: roots/page.json is not a JSON object; run dimensions validate
  ",
      "stdout": "",
    },
    1,
  ]
`);
  });
});

describe("files the CLI writes", () => {
  it("are formatted as Prettier formats them", () => {
    const { root, run } = project();
    run("node", "add", "home", "--title", "Home");
    expect(readFileSync(join(root, ".dimensions", "roots", "home.json"), "utf8")).toBe(
      [
        "{",
        '  "version": 1,',
        '  "root": {',
        '    "id": "home",',
        '    "title": "Home"',
        "  }",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("start from types.json written by init", () => {
    const snapshot: unknown[] = [];
    const root = writeProject({});
    capture(["init"], root);
    snapshot.push(capture(["node", "add", "home", "--title", "Home"], root).code);
    snapshot.push(types);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "attributes": {
        "design": {
          "values": [
            "available",
            "missing",
          ],
        },
      },
      "types": {
        "link": {
          "states": [
            "normal",
            "hovered",
            "selected",
          ],
        },
      },
      "version": 1,
    },
  ]
`);
  });
});
