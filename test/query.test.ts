import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { capture } from "./support/cli.js";
import { cleanup, taskFile, types, writeProject } from "./support/project.js";

afterAll(cleanup);

const website = fileURLToPath(new URL("../examples/website", import.meta.url));

describe("task-tree query", () => {
  it("reports the states blog-link gets from its type", () => {
    const snapshot: unknown[] = [];
    const result = capture(["query", "--dir", website, "blog-link"]);
    snapshot.push(result.code);
    snapshot.push(JSON.parse(result.stdout));
    snapshot.push(result.stderr);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "customAttributes": {
        "design": {
          "hovered": "available",
          "normal": "available",
          "selected": "available",
        },
      },
      "id": "blog-link",
      "present": true,
      "states": [
        "normal",
        "hovered",
        "selected",
      ],
      "title": "Blog link",
      "type": "link",
    },
    "",
  ]
`);
  });

  it("reports no states for a task without a type", () => {
    const snapshot: unknown[] = [];
    const result = capture(["query", "--dir", website, "logo-mark"]);
    snapshot.push(result.code);
    snapshot.push(JSON.parse(result.stdout));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "id": "logo-mark",
      "present": true,
      "states": [],
      "title": "Logo mark",
    },
  ]
`);
  });

  it("fails with exit code 1 when the task does not exist", () => {
    const snapshot: unknown[] = [];
    const result = capture(["query", "--dir", website, "missing-link"]);
    snapshot.push(result.code);
    snapshot.push(result.stderr);
    snapshot.push(result.stdout);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    1,
    "task-tree: task not found: missing-link
  ",
    "",
  ]
`);
  });

  it("fails with exit code 2 when arguments are missing", () => {
    const snapshot: unknown[] = [];
    const result = capture(["query", "--dir", website]);
    snapshot.push(result.code);
    snapshot.push(result.stderr);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    2,
    "task-tree: missing task-id

  Usage: task-tree query <task-id> [<dimension>=<value>...] [<shared-task>=<state>...]

  Shows the task's states and custom attribute values in a context. Dimensions
  left out take their default; those without one are not applied.
  ",
  ]
`);
  });

  it("finds the project from the working directory", () => {
    const snapshot: unknown[] = [];
    const root = writeProject({
      ".task-tree/types.json": types,
      ".task-tree/tasks/a.json": taskFile({ id: "a", title: "A" }),
    });
    const result = capture(["query", "a"], root);
    snapshot.push(result.code);
    snapshot.push(JSON.parse(result.stdout));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "id": "a",
      "present": true,
      "states": [],
      "title": "A",
    },
  ]
`);
  });

  it("reports when there is no project", () => {
    const snapshot: unknown[] = [];
    const result = capture(["query", "a"], writeProject({}));
    snapshot.push(result.code);
    snapshot.push(result.stderr);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    1,
    "task-tree: no .task-tree directory in <tmp> or above; run task-tree init
  ",
  ]
`);
  });

  it("reports a directory without types.json", () => {
    const snapshot: unknown[] = [];
    const directory = writeProject({});
    const result = capture(["query", "--dir", directory, "x"]);
    snapshot.push(result.code);
    snapshot.push(result.stderr);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    1,
    "<tmp>/types.json:1:1: missing-file: types.json not found
  ",
  ]
`);
  });

  it("reports compiler diagnostics instead of answering from an invalid project", () => {
    const snapshot: unknown[] = [];
    const directory = writeProject({
      "types.json": types,
      "tasks/x.json": '{"version":1,"task":{"id":"x","title":"X","type":"nope"}}',
    });
    const result = capture(["query", "--dir", directory, "x"]);
    snapshot.push(result.code);
    snapshot.push(result.stderr);
    snapshot.push(result.stdout);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    1,
    "<tmp>/tasks/x.json:1:50: undefined-type: type "nope" is not defined
  ",
    "",
  ]
`);
  });

  it("finds tasks inside components", () => {
    const snapshot: unknown[] = [];
    const directory = writeProject({
      "types.json": types,
      "components/toolbar.json": {
        version: 1,
        component: { id: "toolbar", title: "Toolbar", children: [{ id: "c", title: "C" }] },
      },
      "tasks/a.json": taskFile({ id: "a", title: "A", children: [{ include: "toolbar" }] }),
    });
    const result = capture(["query", "--dir", directory, "c"]);
    snapshot.push(result.code);
    snapshot.push(JSON.parse(result.stdout));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "id": "c",
      "present": true,
      "states": [],
      "title": "C",
    },
  ]
`);
  });

  it("finds tasks in any task file", () => {
    const snapshot: unknown[] = [];
    const directory = writeProject({
      "types.json": types,
      "tasks/a.json": taskFile({ id: "a", title: "A" }),
      "tasks/b.json": taskFile({ id: "b", title: "B", children: [{ id: "c", title: "C" }] }),
    });
    const result = capture(["query", "--dir", directory, "c"]);
    snapshot.push(result.code);
    snapshot.push(JSON.parse(result.stdout));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "id": "c",
      "present": true,
      "states": [],
      "title": "C",
    },
  ]
`);
  });
});
