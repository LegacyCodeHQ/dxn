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
    const result = capture(["prototype", "validate"], deep);
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
      ["--dir", join(root, "elsewhere"), "prototype", "validate"],
      ["prototype", "validate", "--dir", join(root, "elsewhere")],
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
    const result = capture(["prototype", "validate"], root);
    snapshot.push(result.code);
    snapshot.push(result.stderr);
    snapshot.push(result.stdout);

    expect(snapshot).toMatchInlineSnapshot(`
      [
        1,
        "dxn: no .dxn directory in <tmp> or above; run dxn prototype init
      ",
        "",
      ]
    `);
  });

  it("rejects --dir without a value", () => {
    const snapshot: unknown[] = [];
    const result = capture(["prototype", "validate", "--dir"]);
    snapshot.push(result.code);
    snapshot.push(result.stderr);

    expect(snapshot).toMatchInlineSnapshot(`
      [
        2,
        "dxn: --dir needs a directory

      Usage: dxn <command> [options]

      Commands:
        check <file>                       Parse and check a file; say what it declares,
                                           or report every problem it has. Warnings
                                           are printed, but do not fail. Needs no
                                           project.
        states <file> <type>               Evaluate a type: the states it has in each
                                           profile, or without profiles under each
                                           combination of the dimensions it needs,
                                           as a Markdown table; or a child in place,
                                           given its path from a type, such as
                                           Toolbar.menu.toggle: where it is inside its
                                           parents, with the states they give it
        cases <file> <type>                List the cases a type, or a child in place,
              [--combinations]             has: those that can be told apart, each
                                           with what it covers where it covers more
                                           than one combination; with --combinations,
                                           every combination, as if nothing were
                                           alike
        validate <file>                    Check the stored records: each record's data is
                                           every JSON file in a folder named after it in
                                           kebab-case, next to the file, each a list of
                                           records with every field given, each of its
                                           type, and no others. Print what it checked, or
                                           every problem with its line, column and path
        attach <file> <path> --file <f> --frame <id> [--field <name>=<value>]... <key>=<value>...
                                           Record a frame for each combination the
                                           context's keys give (a|b lists several) that
                                           exists in place, with its fingerprint; an
                                           entry for the same combination, frame and
                                           fields is replaced; with --dry-run, say what
                                           it would write
        status <file> [--missing]          Count, for each record with context, the
                                           combinations of every element in the file's
                                           trees, in place, and those a stored record is
                                           about; with --missing, list the others
        rename <file> <Enum>.<value> <new> Rename an enum's value in the file and in every
                                           stored record, once both check; with --dry-run,
                                           say what it would write

        prototype <command>                The JSON prototype's commands, kept until it
                                           is retired

        help [<command>]                   Show this overview, or a command's usage

      Run "dxn help <command>" (or "dxn <command> --help") for a command's usage
      and options, and "dxn prototype" for the prototype's commands. The
      docs/language/guide.md file of the dxn package explains the language.

      Options:
        --dir <directory>                  Use this project directory instead of the
                                           nearest .dxn
        --dry-run                          Print the files a command would write,
                                           without writing them
        -h, --help                         Show this help
        -V, --version                      Print version information as JSON
      ",
      ]
    `);
  });
});

describe("dxn init", () => {
  it("creates .dxn with types.json in the working directory", () => {
    const snapshot: unknown[] = [];
    const root = writeProject({});
    const result = capture(["prototype", "init"], root);
    snapshot.push(result.code);
    snapshot.push(JSON.parse(result.stdout));
    snapshot.push(JSON.parse(readFileSync(join(root, ".dxn", "types.json"), "utf8")));
    snapshot.push(capture(["prototype", "validate"], root).code);

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
    const result = capture(["prototype", "init", "--dir", join(root, "plans")], root);
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
    const result = capture(["prototype", "init"], root);
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
    expect(capture(["prototype", "init", "extra"], writeProject({})).code).toBe(2);
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
    const result = capture(["prototype", "validate"], root);
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
    expect(capture(["prototype", "validate", "extra"], writeProject({})).code).toBe(2);
  });
});
