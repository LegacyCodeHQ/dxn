import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { capture } from "../support/cli.js";
import { cleanup, rootFile, types, writeProject } from "../support/project.js";

afterAll(cleanup);

describe("finding the project", () => {
  it("uses the nearest .dxn directory above the working directory", () => {
    const snapshot: unknown[] = [];
    const root = writeProject({ ".dxn/types.json": types });
    const deep = join(root, "src", "fragments");
    mkdirSync(deep, { recursive: true });
    const result = capture(["validate"], deep);
    snapshot.push(result.code);
    snapshot.push(JSON.parse(result.stdout));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "errors": 0,
      "project": "<tmp>/.dxn",
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
    "dxn: no .dxn directory in <tmp> or above; run dxn init
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
        "dxn: --dir needs a directory

      Usage: dxn <command> [options]

      Project
        workflow            Print the step-by-step guide to building a model; start here
        init                Create a .dxn project in the working directory
        validate            Compile the project and report every error
        status [<node-id>]  Report each required check as passed, failed or missing

      Explore
        tree                Print the roots and fragments
        show <node-id> [<context>...]
                            Show a node's states and values in one context
        contexts <node-id> [<filter>...]
                            List every context a node exists in
        views <node-id>     List every distinct view of a node's subtree: one diagram each
        view <node-id> [<context>...]
                            Print the tree present in one view
        axes <node-id>      List what a view or show of a node accepts
        transitions <node-id>
                            List how a shared node's state changes
        evidence <node-id> --actor <name>
                            List every context of a node and the actor's evidence for it

      Record
        verify <node-id> --check <c> --result passed|failed --by <who> [<context>...]
                            Record a check's result for a node in one context
        unverify <node-id> --check <c> [<context>...]
                            Remove that record
        attach <node-id> --actor <a> --file <path> --frame <id> [<context>...]
                            Record an actor's evidence for a node in one context
        detach <node-id> --actor <a> --frame <id> [<context>...]
                            Remove that evidence

      Model
        node <subcommand>   Add, move, rename and remove nodes; say where they exist
        fragment <subcommand>
                            Add, extract and remove reusable fragments
        type <subcommand>   List and add types and states, and set their values
        state-group <subcommand>
                            List and declare groups of states that exclude each other
        attribute <subcommand>
                            List and declare attributes and their values
        check <subcommand>  List and declare checks that types can require
        dimension <subcommand>
                            List and add dimensions, their values, default and scope
        profile <subcommand>
                            List, add and remove the combinations of values that exist
        modifier <subcommand>
                            List, add and remove accessories that change some profiles' values
        override <subcommand>
                            Change states and values for a dimension value or combination
        expectation <subcommand>
                            List, add and remove the rules the model must follow
        actor <subcommand>  List and declare the roles that do work against the model

      Language
        lang <subcommand>   Check a file in the dxn language, being designed

        help [<command>]    Show this overview, or a command's usage

      To build a model, start with "dxn workflow": it prints the step-by-step
      guide as Markdown. Run "dxn help <command>" (or "dxn <command>
      --help") for a command's options. The docs/ folder of the dxn package
      also explains the concepts, every command, every diagnostic code and the JSON
      output.

      Options:
        --dir <directory>   Use this project directory instead of the nearest .dxn
        --dry-run           Print the files a command would write, without writing them
        -h, --help          Show this help
        -V, --version       Print version information as JSON
      ",
      ]
    `);
  });
});

describe("dxn init", () => {
  it("creates .dxn with types.json in the working directory", () => {
    const snapshot: unknown[] = [];
    const root = writeProject({});
    const result = capture(["init"], root);
    snapshot.push(result.code);
    snapshot.push(JSON.parse(result.stdout));
    snapshot.push(JSON.parse(readFileSync(join(root, ".dxn", "types.json"), "utf8")));
    snapshot.push(capture(["validate"], root).code);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    0,
    {
      "created": "<tmp>/.dxn",
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
    const root = writeProject({ ".dxn/types.json": "keep" });
    const result = capture(["init"], root);
    snapshot.push(result.code);
    snapshot.push(result.stderr);
    snapshot.push(readFileSync(join(root, ".dxn", "types.json"), "utf8"));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    1,
    "dxn: <tmp>/.dxn already exists
  ",
    "keep",
  ]
`);
  });

  it("takes no arguments", () => {
    expect(capture(["init", "extra"], writeProject({})).code).toBe(2);
  });
});

describe("dxn validate", () => {
  it("prints each diagnostic with its file, line and column, and exits 1", () => {
    const snapshot: unknown[] = [];
    const root = writeProject({
      ".dxn/types.json": types,
      ".dxn/roots/a.json": '{"version":1,"root":{"id":"a","title":"A","type":"nope"}}',
      ".dxn/roots/b.json": rootFile({ id: "b", title: "B", extra: 1 }),
    });
    const result = capture(["validate"], root);
    const _roots = join(root, ".dxn", "roots");
    snapshot.push(result.code);
    snapshot.push(result.stderr);
    snapshot.push(JSON.parse(result.stdout));

    expect(snapshot).toMatchInlineSnapshot(`
  [
    1,
    "<tmp>/.dxn/roots/a.json:1:50: undefined-type: type "nope" is not defined
  <tmp>/.dxn/roots/b.json:6:5: unknown-key: unknown key "extra"
  ",
    {
      "errors": 2,
      "project": "<tmp>/.dxn",
    },
  ]
`);
  });

  it("takes no arguments", () => {
    expect(capture(["validate", "extra"], writeProject({})).code).toBe(2);
  });
});
