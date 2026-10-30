import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { capture } from "../support/cli.js";
import { cleanup, type Files, taskFile, writeProject } from "../support/project.js";

afterAll(cleanup);

function project(files: Files = {}) {
  const root = writeProject(
    Object.fromEntries(
      Object.entries({
        "types.json": {
          version: 1,
          customAttributes: { design: { values: ["available", "missing"] } },
        },
        ...files,
      }).map(([name, content]) => [`.task-tree/${name}`, content]),
    ),
  );
  return {
    run: (...argv: string[]) => capture(argv, root),
    read: (name: string) =>
      JSON.parse(readFileSync(join(root, ".task-tree", name), "utf8")) as Record<string, unknown>,
  };
}

const types = (read: (name: string) => Record<string, unknown>) => read("types.json").types;

describe("type add", () => {
  it("adds a type, with or without states", () => {
    const snapshot: unknown[] = [];
    const { run, read } = project();
    snapshot.push(run("type", "add", "link", "--states", "normal,hovered,selected").code);
    snapshot.push(run("type", "add", "button").code);
    snapshot.push(types(read));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    0,
    {
      "button": {},
      "link": {
        "states": [
          "normal",
          "hovered",
          "selected",
        ],
      },
    },
  ]
`);
  });

  it("refuses an existing type and usage errors", () => {
    const snapshot: unknown[] = [];
    const { run } = project();
    run("type", "add", "link");
    snapshot.push(run("type", "add", "link"));
    snapshot.push(run("type", "add").code);
    snapshot.push(run("type", "frobnicate").code);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    {
      "code": 1,
      "stderr": "task-tree: type "link" already exists
  ",
      "stdout": "",
    },
    2,
    2,
  ]
`);
  });

  it("refuses names the compiler rejects", () => {
    const { run } = project();
    expect(run("type", "add", "link", "--states", "a,a").stderr).toContain("duplicate-state");
  });
});

describe("type add-state and remove-state", () => {
  it("add and remove states", () => {
    const snapshot: unknown[] = [];
    const { run, read } = project();
    run("type", "add", "link", "--states", "normal");
    snapshot.push(run("type", "add-state", "link", "hovered").code);
    snapshot.push(run("type", "remove-state", "link", "normal").code);
    snapshot.push(types(read));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    0,
    {
      "link": {
        "states": [
          "hovered",
        ],
      },
    },
  ]
`);
  });

  it("refuse to remove a state that has values, and unknown types", () => {
    const snapshot: unknown[] = [];
    const { run } = project();
    run("type", "add", "link", "--states", "normal");
    run("type", "set", "link", "design", "normal=missing");
    snapshot.push(run("type", "remove-state", "link", "normal").stderr);
    snapshot.push(run("type", "add-state", "button", "x"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    "<tmp>/.task-tree/types.json:13:11: unknown-state: "normal" is not a state of this type
  ",
    {
      "code": 1,
      "stderr": "task-tree: type not found: button
  ",
      "stdout": "",
    },
  ]
`);
  });
});

describe("type set and unset", () => {
  it("set and clear a type's attribute values", () => {
    const snapshot: unknown[] = [];
    const { run, read } = project();
    run("type", "add", "link", "--states", "normal,hovered");
    snapshot.push(run("type", "set", "link", "design", "normal=available", "hovered=missing").code);
    snapshot.push(types(read));
    snapshot.push(run("type", "unset", "link", "design").code);
    snapshot.push(types(read));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "link": {
        "customAttributes": {
          "design": {
            "hovered": "missing",
            "normal": "available",
          },
        },
        "states": [
          "normal",
          "hovered",
        ],
      },
    },
    0,
    {
      "link": {
        "states": [
          "normal",
          "hovered",
        ],
      },
    },
  ]
`);
  });
});

describe("type rename", () => {
  it("updates the tasks and overrides that use it", () => {
    const snapshot: unknown[] = [];
    const { run, read } = project({
      "tasks/page.json": taskFile({
        id: "page",
        title: "Page",
        children: [{ id: "a", title: "A", type: "link" }],
      }),
      "dimensions/pointer.json": { version: 1, values: ["touch"], appliesTo: ["page"] },
      "overrides/pointer.json": {
        version: 1,
        overrides: { touch: { types: { link: { states: { remove: ["hovered"] } } } } },
      },
    });
    run("type", "add", "link", "--states", "normal,hovered");
    snapshot.push(run("type", "rename", "link", "toolbar-link").code);
    snapshot.push(types(read));
    snapshot.push(read("tasks/page.json"));
    snapshot.push(read("overrides/pointer.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "toolbar-link": {
        "states": [
          "normal",
          "hovered",
        ],
      },
    },
    {
      "task": {
        "children": [
          {
            "id": "a",
            "title": "A",
            "type": "toolbar-link",
          },
        ],
        "id": "page",
        "title": "Page",
      },
      "version": 1,
    },
    {
      "overrides": {
        "touch": {
          "types": {
            "toolbar-link": {
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
});

describe("type remove", () => {
  it("removes an unused type and refuses one in use", () => {
    const snapshot: unknown[] = [];
    const { run, read } = project({
      "tasks/page.json": taskFile({
        id: "page",
        title: "Page",
        children: [{ id: "a", title: "A", type: "link" }],
      }),
    });
    run("type", "add", "link");
    run("type", "add", "button");
    snapshot.push(run("type", "remove", "button").code);
    snapshot.push(run("type", "remove", "link").stderr);
    snapshot.push(types(read));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    "<tmp>/.task-tree/tasks/page.json:10:17: undefined-type: type "link" is not defined
  ",
    {
      "link": {},
    },
  ]
`);
  });
});
