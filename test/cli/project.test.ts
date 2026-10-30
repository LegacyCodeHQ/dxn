import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { capture } from "../support/cli.js";
import { cleanup, taskFile, types, writeProject } from "../support/project.js";

afterAll(cleanup);

describe("finding the project", () => {
  it("uses the nearest .task-tree directory above the working directory", () => {
    const snapshot: unknown[] = [];
    const root = writeProject({ ".task-tree/types.json": types });
    const deep = join(root, "src", "components");
    mkdirSync(deep, { recursive: true });
    const result = capture(["validate"], deep);
    snapshot.push(result.code);
    snapshot.push(JSON.parse(result.stdout));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "errors": 0,
      "project": "<tmp>/.task-tree",
    },
  ]
`);
  });

  it("uses --dir when given, wherever it appears", () => {
    const snapshot: unknown[] = [];
    const root = writeProject({ "elsewhere/types.json": types });
    for (const argv of [
      ["--dir", join(root, "elsewhere"), "validate"],
      ["validate", "--dir", join(root, "elsewhere")],
    ]) {
      const result = capture(argv, root);
      snapshot.push(result.code, JSON.parse(result.stdout).project);
    }
    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        "<tmp>/elsewhere",
        0,
        "<tmp>/elsewhere",
      ]
    `);
  });

  it("reports when there is no project", () => {
    const snapshot: unknown[] = [];
    const root = writeProject({});
    const result = capture(["validate"], root);
    snapshot.push(result.code);
    snapshot.push(result.stderr);
    snapshot.push(result.stdout);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    1,
    "task-tree: no .task-tree directory in <tmp> or above; run task-tree init
  ",
    "",
  ]
`);
  });

  it("rejects --dir without a value", () => {
    const snapshot: unknown[] = [];
    const result = capture(["validate", "--dir"]);
    snapshot.push(result.code);
    snapshot.push(result.stderr);

    expect(snapshot).toMatchInlineSnapshot(`
      [
        2,
        "task-tree: --dir needs a directory

      Usage: task-tree <command> [options]

      Commands:
        help [<command>]    Show this overview, or a command's usage
        init                Create a .task-tree project in the working directory
        validate            Compile the project and report every error
        query <task-id> [<dimension>=<value>...]
                            Show a task's states and values in a context
        contexts <task-id>  List every context a task exists in
        status [<task-id>]  Report each required check as passed, failed or missing
        transitions <task-id>
                            List how a shared task's state changes
        dimensions          List every dimension, its values, default and scope
        axes <task-id>      List what a view or query of a task accepts
        views <task-id>     List every distinct view of a task's subtree: one diagram each
        view <task-id> [<context>...]
                            Print the tree present in one view
        tree                Print the pages and components
        verify <task-id> --check <c> --result passed|failed --by <who> [<context>...]
                            Record a check's result for a task in one context
        unverify <task-id> --check <c> [<context>...]
                            Remove that record
        task <subcommand>   Add, move, rename and remove tasks, and set their values
        type <subcommand>   Add types and states, and set their values
        state-group <subcommand>
                            Declare groups of independent states, such as interaction
        attribute <subcommand>
                            Declare custom attributes and their values
        check <subcommand>  Declare checks that types can require
        component <subcommand>
                            Add, extract and remove reusable components
        dimension <subcommand>
                            Add dimensions, their values, default and scope
        only <dimension> <task-id> <value>...
                            Say at which values of a dimension a task exists
        override <subcommand>
                            Change states and values for a dimension value or combination

      Run "task-tree help <command>" (or "task-tree <command> --help") for a command's
      options. The docs/ folder of the task-tree package explains the concepts
      (concepts.md), every command (commands.md), every diagnostic code
      (diagnostics.md) and the JSON output (output.md).

      Options:
        --dir <directory>   Use this project directory instead of the nearest .task-tree
        --dry-run           Print the files a command would write, without writing them
        -h, --help          Show this help
        -V, --version       Print version information as JSON
      ",
      ]
    `);
  });
});

describe("task-tree init", () => {
  it("creates .task-tree with types.json in the working directory", () => {
    const snapshot: unknown[] = [];
    const root = writeProject({});
    const result = capture(["init"], root);
    snapshot.push(result.code);
    snapshot.push(JSON.parse(result.stdout));
    snapshot.push(JSON.parse(readFileSync(join(root, ".task-tree", "types.json"), "utf8")));
    snapshot.push(capture(["validate"], root).code);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "created": "<tmp>/.task-tree",
    },
    {
      "version": 1,
    },
    0,
  ]
`);
  });

  it("creates the project at --dir", () => {
    const snapshot: unknown[] = [];
    const root = writeProject({});
    const result = capture(["init", "--dir", join(root, "plans")], root);
    snapshot.push(result.code);
    snapshot.push(existsSync(join(root, "plans", "types.json")));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    true,
  ]
`);
  });

  it("refuses to overwrite an existing project", () => {
    const snapshot: unknown[] = [];
    const root = writeProject({ ".task-tree/types.json": "keep" });
    const result = capture(["init"], root);
    snapshot.push(result.code);
    snapshot.push(result.stderr);
    snapshot.push(readFileSync(join(root, ".task-tree", "types.json"), "utf8"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    1,
    "task-tree: <tmp>/.task-tree already exists
  ",
    "keep",
  ]
`);
  });

  it("takes no arguments", () => {
    expect(capture(["init", "extra"], writeProject({})).code).toBe(2);
  });
});

describe("task-tree validate", () => {
  it("prints each diagnostic with its file, line and column, and exits 1", () => {
    const snapshot: unknown[] = [];
    const root = writeProject({
      ".task-tree/types.json": types,
      ".task-tree/tasks/a.json": '{"version":1,"task":{"id":"a","title":"A","type":"nope"}}',
      ".task-tree/tasks/b.json": taskFile({ id: "b", title: "B", extra: 1 }),
    });
    const result = capture(["validate"], root);
    const _tasks = join(root, ".task-tree", "tasks");
    snapshot.push(result.code);
    snapshot.push(result.stderr);
    snapshot.push(JSON.parse(result.stdout));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    1,
    "<tmp>/.task-tree/tasks/a.json:1:50: undefined-type: type "nope" is not defined
  <tmp>/.task-tree/tasks/b.json:6:5: unknown-key: unknown key "extra"
  ",
    {
      "errors": 2,
      "project": "<tmp>/.task-tree",
    },
  ]
`);
  });

  it("takes no arguments", () => {
    expect(capture(["validate", "extra"], writeProject({})).code).toBe(2);
  });
});
