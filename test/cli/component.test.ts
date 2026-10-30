import { afterAll, describe, expect, it } from "vitest";
import { cleanup, taskFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const types = { version: 1 };
const page = (children: unknown[] = []) => taskFile({ id: "page", title: "Page", children });

describe("component add and remove", () => {
  it("add a component file and remove an unused one", () => {
    const snapshot: unknown[] = [];
    const { run, read, exists } = cliProject({ "types.json": types });
    snapshot.push(run("component", "add", "toolbar", "--title", "Toolbar").code);
    snapshot.push(read("components/toolbar.json"));
    snapshot.push(run("component", "add", "toolbar", "--title", "Again"));
    snapshot.push(run("component", "remove", "toolbar").code);
    snapshot.push(exists("components/toolbar.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "component": {
        "id": "toolbar",
        "title": "Toolbar",
      },
      "version": 1,
    },
    {
      "code": 1,
      "stderr": "task-tree: component "toolbar" already exists
  ",
      "stdout": "",
    },
    0,
    false,
  ]
`);
  });

  it("refuse to remove an included component and unknown ones", () => {
    const snapshot: unknown[] = [];
    const { run } = cliProject({
      "types.json": types,
      "components/toolbar.json": { version: 1, component: { id: "toolbar", title: "Toolbar" } },
      "tasks/page.json": page([{ include: "toolbar" }]),
    });
    snapshot.push(run("component", "remove", "toolbar").stderr);
    snapshot.push(run("component", "remove", "nope"));
    snapshot.push(run("component", "add", "x").code);
    snapshot.push(run("component").code);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    "<tmp>/.task-tree/tasks/page.json:8:20: unknown-component: no components/toolbar.json defines this component
  ",
    {
      "code": 1,
      "stderr": "task-tree: component not found: nope
  ",
      "stdout": "",
    },
    2,
    2,
  ]
`);
  });
});

describe("component extract", () => {
  it("moves a subtree into a component and includes it in its place", () => {
    const snapshot: unknown[] = [];
    const { run, read } = cliProject({
      "types.json": types,
      "tasks/page.json": page([
        { id: "toolbar", title: "Toolbar", children: [{ id: "wordmark", title: "Wordmark" }] },
        { id: "body", title: "Body" },
      ]),
    });
    const result = run("component", "extract", "toolbar");
    snapshot.push(result.code);
    snapshot.push(JSON.parse(result.stdout));
    snapshot.push(read("components/toolbar.json"));
    snapshot.push(read("tasks/page.json"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "removed": [],
      "written": [
        "components/toolbar.json",
        "tasks/page.json",
      ],
    },
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
    {
      "task": {
        "children": [
          {
            "include": "toolbar",
          },
          {
            "id": "body",
            "title": "Body",
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

  it("refuses a file's root task", () => {
    const { run } = cliProject({ "types.json": types, "tasks/page.json": page() });
    expect(run("component", "extract", "page")).toMatchObject({
      code: 1,
      stderr: 'task-tree: "page" is a file\'s root task; only a task inside one can be extracted\n',
    });
  });
});

describe("task include and uninclude", () => {
  it("add and remove an include under a task", () => {
    const snapshot: unknown[] = [];
    const { run, read } = cliProject({
      "types.json": types,
      "components/toolbar.json": { version: 1, component: { id: "toolbar", title: "Toolbar" } },
      "tasks/page.json": page(),
    });
    snapshot.push(run("task", "include", "page", "toolbar").code);
    snapshot.push(read("tasks/page.json"));
    snapshot.push(run("task", "include", "page", "toolbar").stderr);
    snapshot.push(run("task", "uninclude", "page", "toolbar").code);
    snapshot.push(read("tasks/page.json"));
    snapshot.push(run("task", "uninclude", "page", "toolbar"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "task": {
        "children": [
          {
            "include": "toolbar",
          },
        ],
        "id": "page",
        "title": "Page",
      },
      "version": 1,
    },
    "<tmp>/.task-tree/tasks/page.json:11:20: duplicate-include: "toolbar" is already part of "page"; its tasks would appear twice
  ",
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
      "code": 1,
      "stderr": "task-tree: "page" does not include "toolbar"
  ",
      "stdout": "",
    },
  ]
`);
  });

  it("refuse unknown components", () => {
    const { run } = cliProject({ "types.json": types, "tasks/page.json": page() });
    expect(run("task", "include", "page", "nope").stderr).toContain("unknown-component");
  });
});
