import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { capture } from "../support/cli.js";
import { cleanup, type Files, taskFile, types, writeProject } from "../support/project.js";

afterAll(cleanup);

const typed = {
  version: 1,
  customAttributes: { design: { values: ["available", "missing"] } },
  types: { link: { states: ["normal", "hovered"] } },
};

function project(files: Files = {}) {
  const root = writeProject(
    Object.fromEntries(
      Object.entries({ "types.json": typed, ...files }).map(([name, content]) => [
        `.task-tree/${name}`,
        content,
      ]),
    ),
  );
  const run = (...argv: string[]) => capture(argv, root);
  const read = (name: string) =>
    JSON.parse(readFileSync(join(root, ".task-tree", name), "utf8")) as unknown;
  const exists = (name: string) => existsSync(join(root, ".task-tree", name));
  return { root, run, read, exists };
}

const page = (children: unknown[] = []) => taskFile({ id: "page", title: "Page", children });

describe("task add", () => {
  it("creates a page when there is no parent", () => {
    const snapshot: unknown[] = [];
    const { run, read } = project();
    const result = run("task", "add", "home", "--title", "Home page");
    snapshot.push(result.code);
    snapshot.push(JSON.parse(result.stdout));
    snapshot.push(read("tasks/home.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "removed": [],
      "written": [
        "tasks/home.json",
      ],
    },
    {
      "task": {
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
      "tasks/page.json": page([{ id: "toolbar", title: "Toolbar" }]),
    });
    snapshot.push(
      run(
        "task",
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
    snapshot.push(read("tasks/page.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "task": {
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

  it("adds into components", () => {
    const snapshot: unknown[] = [];
    const { run, read } = project({
      "components/toolbar.json": { version: 1, component: { id: "toolbar", title: "Toolbar" } },
    });
    snapshot.push(
      run("task", "add", "wordmark", "--title", "Wordmark", "--parent", "toolbar").code,
    );
    snapshot.push(read("components/toolbar.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "component": {
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
    const { run, exists } = project({ "tasks/page.json": page() });
    const duplicate = run("task", "add", "page", "--title", "Again", "--parent", "page");
    snapshot.push(duplicate.code);
    snapshot.push(duplicate.stderr);
    snapshot.push(run("task", "add", "x", "--title", "X", "--type", "button").stderr);
    snapshot.push(exists("tasks/x.json"));

    expect(snapshot).toMatchInlineSnapshot(`
      [
        1,
        "<tmp>/.task-tree/tasks/page.json:8:15: duplicate-id: task id "page" is already used at tasks/page.json $.task
      ",
        "<tmp>/.task-tree/tasks/x.json:6:13: undefined-type: type "button" is not defined
      ",
        false,
      ]
    `);
  });

  it("reports an unknown parent and usage errors", () => {
    const snapshot: unknown[] = [];
    const { run } = project();
    snapshot.push(run("task", "add", "x", "--title", "X", "--parent", "nope"));
    snapshot.push(run("task", "add", "x").code);
    snapshot.push(run("task", "add", "--title", "X").code);
    snapshot.push(run("task", "frobnicate").code);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    {
      "code": 1,
      "stderr": "task-tree: task not found: nope
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
    const result = run("task", "add", "home", "--title", "Home", "--dry-run");
    snapshot.push(result.code);
    snapshot.push(JSON.parse(result.stdout));
    snapshot.push(exists("tasks/home.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "dryRun": true,
      "removed": [],
      "written": {
        "tasks/home.json": "{
    "version": 1,
    "task": {
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

describe("task set-title and set-type", () => {
  it("change the title and type", () => {
    const snapshot: unknown[] = [];
    const { run, read } = project({ "tasks/page.json": page([{ id: "a", title: "A" }]) });
    snapshot.push(run("task", "set-title", "a", "Renamed").code);
    snapshot.push(run("task", "set-type", "a", "link").code);
    snapshot.push(read("tasks/page.json"));
    snapshot.push(run("task", "set-type", "a", "--none").code);
    snapshot.push(read("tasks/page.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    0,
    {
      "task": {
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
      "task": {
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

  it("refuse to leave custom attributes without a type", () => {
    const snapshot: unknown[] = [];
    const { run } = project({
      "tasks/page.json": page([
        { id: "a", title: "A", type: "link", customAttributes: { design: { normal: "missing" } } },
      ]),
    });
    const result = run("task", "set-type", "a", "--none");
    snapshot.push(result.code);
    snapshot.push(result.stderr);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    1,
    "<tmp>/.task-tree/tasks/page.json:10:9: attributes-without-type: customAttributes on a task require the task to have a type
  ",
  ]
`);
  });
});

describe("task move", () => {
  it("moves a subtree to a new parent, across files", () => {
    const snapshot: unknown[] = [];
    const { run, read } = project({
      "tasks/page.json": page([{ id: "a", title: "A", children: [{ id: "b", title: "B" }] }]),
      "tasks/other.json": taskFile({ id: "other", title: "Other" }),
    });
    snapshot.push(run("task", "move", "a", "--parent", "other").code);
    snapshot.push(read("tasks/page.json"));
    snapshot.push(read("tasks/other.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "task": {
        "children": [],
        "id": "page",
        "title": "Page",
      },
      "version": 1,
    },
    {
      "task": {
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

  it("refuses to move a task into its own subtree", () => {
    const { run } = project({
      "tasks/page.json": page([{ id: "a", title: "A", children: [{ id: "b", title: "B" }] }]),
    });
    expect(run("task", "move", "a", "--parent", "b")).toMatchObject({
      code: 1,
      stderr: 'task-tree: cannot move "a" into its own subtree\n',
    });
  });

  it("turns a page into a child, removing its file", () => {
    const snapshot: unknown[] = [];
    const { run, exists } = project({
      "tasks/page.json": page(),
      "tasks/other.json": taskFile({ id: "other", title: "Other" }),
    });
    const result = run("task", "move", "other", "--parent", "page");
    snapshot.push(result.code);
    snapshot.push(JSON.parse(result.stdout));
    snapshot.push(exists("tasks/other.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "removed": [
        "tasks/other.json",
      ],
      "written": [
        "tasks/page.json",
      ],
    },
    false,
  ]
`);
  });
});

describe("task rename", () => {
  it("updates every reference to the task", () => {
    const snapshot: unknown[] = [];
    const { run, read } = project({
      "tasks/page.json": page([{ id: "a", title: "A", type: "link" }]),
      "dimensions/pointer.json": { version: 1, values: ["mouse", "touch"], appliesTo: ["a"] },
      "overrides/pointer.json": {
        version: 1,
        only: { a: ["mouse"] },
        overrides: { mouse: { tasks: { a: { states: { remove: ["hovered"] } } } } },
      },
      "verification/page.json": { version: 1, records: [] },
    });
    snapshot.push(run("task", "rename", "a", "b").code);
    snapshot.push(read("tasks/page.json"));
    snapshot.push(read("dimensions/pointer.json"));
    snapshot.push(read("overrides/pointer.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "task": {
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
          "tasks": {
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
      "tasks/page.json": page(),
      "verification/page.json": { version: 1, records: [] },
    });
    snapshot.push(run("task", "rename", "page", "home").code);
    snapshot.push(exists("tasks/home.json"));
    snapshot.push(exists("verification/home.json"));
    snapshot.push(exists("tasks/page.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    true,
    true,
    false,
  ]
`);
  });

  it("renames a component's file and the includes that use it", () => {
    const snapshot: unknown[] = [];
    const { run, read, exists } = project({
      "components/toolbar.json": { version: 1, component: { id: "toolbar", title: "Toolbar" } },
      "tasks/page.json": page([{ include: "toolbar" }]),
    });
    snapshot.push(run("task", "rename", "toolbar", "header").code);
    snapshot.push(exists("components/toolbar.json"));
    snapshot.push(read("components/header.json"));
    snapshot.push(read("tasks/page.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    false,
    {
      "component": {
        "id": "header",
        "title": "Toolbar",
      },
      "version": 1,
    },
    {
      "task": {
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
      task: "a",
      context: { state: "normal" },
      check: "visual",
      result: "passed",
      by: "agent",
      at: "2026-10-30T19:20:00Z",
    };
    const { run, read } = project({
      "types.json": {
        version: 1,
        customChecks: { visual: {} },
        types: { link: { states: ["normal"], checks: ["visual"] } },
      },
      "tasks/page.json": page([{ id: "a", title: "A", type: "link" }]),
      "verification/page.json": { version: 1, records: [record] },
    });
    snapshot.push(run("task", "rename", "a", "b").code);
    snapshot.push(read("verification/page.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "records": [
        {
          "at": "2026-10-30T19:20:00Z",
          "by": "agent",
          "check": "visual",
          "context": {
            "state": "normal",
          },
          "result": "passed",
          "task": "b",
        },
      ],
      "version": 1,
    },
  ]
`);
  });
});

describe("task remove", () => {
  it("removes a task and its subtree", () => {
    const snapshot: unknown[] = [];
    const { run, read } = project({
      "tasks/page.json": page([{ id: "a", title: "A", children: [{ id: "b", title: "B" }] }]),
    });
    snapshot.push(run("task", "remove", "a").code);
    snapshot.push(read("tasks/page.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "task": {
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
    const { run, exists } = project({ "tasks/page.json": page() });
    snapshot.push(run("task", "remove", "page").code);
    snapshot.push(exists("tasks/page.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    false,
  ]
`);
  });

  it("refuses while something refers to the task", () => {
    const snapshot: unknown[] = [];
    const { run, exists } = project({
      "tasks/page.json": page([{ id: "a", title: "A" }]),
      "dimensions/pointer.json": { version: 1, values: ["mouse"], appliesTo: ["a"] },
    });
    const result = run("task", "remove", "a");
    snapshot.push(result.code);
    snapshot.push(result.stderr);
    snapshot.push(exists("tasks/page.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    1,
    "<tmp>/.task-tree/dimensions/pointer.json:7:5: unknown-task: task "a" does not exist
  ",
    true,
  ]
`);
  });
});

describe("task set and unset", () => {
  it("set and clear an instance's attribute values", () => {
    const snapshot: unknown[] = [];
    const { run, read } = project({
      "tasks/page.json": page([{ id: "a", title: "A", type: "link" }]),
    });
    snapshot.push(run("task", "set", "a", "design", "normal=missing", "hovered=available").code);
    snapshot.push(read("tasks/page.json"));
    snapshot.push(run("task", "unset", "a", "design", "hovered").code);
    snapshot.push(read("tasks/page.json"));
    snapshot.push(run("task", "unset", "a", "design").code);
    snapshot.push(read("tasks/page.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "task": {
        "children": [
          {
            "customAttributes": {
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
      "task": {
        "children": [
          {
            "customAttributes": {
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
      "task": {
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
    const { run } = project({ "tasks/page.json": page([{ id: "a", title: "A", type: "link" }]) });
    snapshot.push(run("task", "set", "a", "design", "normal=maybe").stderr);
    snapshot.push(run("task", "set", "a", "design", "normal").code);
    snapshot.push(run("task", "set", "a", "design").code);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    "<tmp>/.task-tree/tasks/page.json:13:23: unknown-value: "maybe" is not a declared value of "design"
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
    const { run } = project({ "tasks/page.json": "{" });
    snapshot.push(run("task", "add", "x", "--title", "X", "--parent", "page"));
    snapshot.push(
      run("task", "add", "x", "--title", "X", "--parent", "page", "--dir", "/nonexistent").code,
    );

    expect(snapshot).toMatchInlineSnapshot(`
  [
    {
      "code": 1,
      "stderr": "task-tree: tasks/page.json is not a JSON object; run task-tree validate
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
    run("task", "add", "home", "--title", "Home");
    expect(readFileSync(join(root, ".task-tree", "tasks", "home.json"), "utf8")).toBe(
      [
        "{",
        '  "version": 1,',
        '  "task": {',
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
    snapshot.push(capture(["task", "add", "home", "--title", "Home"], root).code);
    snapshot.push(types);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "customAttributes": {
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
