import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { capture } from "./support/cli.js";
import { cleanup, writeProject } from "./support/project.js";

afterAll(cleanup);

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

describe("dxn cli", () => {
  it("prints the package version as JSON with --version", () => {
    const snapshot: unknown[] = [];
    const result = capture(["--version"]);
    snapshot.push(result.code);
    // The version printed is package.json's, whatever it is.
    snapshot.push(JSON.parse(result.stdout).version === pkg.version);
    snapshot.push(result.stderr);

    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        true,
        "",
      ]
    `);
  });

  it("prints usage with --help", () => {
    const snapshot: unknown[] = [];
    const result = capture(["--help"]);
    snapshot.push(result.code);
    snapshot.push(result.stdout);

    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        "Usage: dxn <command> [options]

      Commands:
        check <file> [--expect <title>]    Parse and check a file; say what it declares,
                                           or report every problem it has. Warnings
                                           are printed, but do not fail. With
                                           --expect, run only the expectation with
                                           that title, and say whether it holds
        fmt <file>... [--check]            Write each file the one way a .dxn file is
                                           written, and name the files changed; with
                                           --check, write nothing, name the files not
                                           written that way, and fail if there are any
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
        attach <file> <path> --actor <name> --data <json> <key>=<value>...
                                           Record, as the actor, the record it records,
                                           for each combination the context's keys give
                                           (a|b lists several) that exists in place:
                                           --data gives its fields as JSON, and each
                                           PenNode's fingerprint is taken now, of its
                                           node or else its frame; an entry for the same
                                           combination, actor and data is replaced; with
                                           --dry-run, say what it would write
        status <file> [--missing]          Count, for each record an actor records, the
                                           combinations of every element in the file's
                                           trees, in place, and those a stored record is
                                           about; with --missing, list the others
        review <file>                      Write, for each tree and each record with a
                                           PenNode, a Markdown page of its combinations,
                                           each with its status and the picture of what
                                           was recorded, pictures/<node>.png beside the
                                           page; pages go in dxn's cache, outside the
                                           repository, and are named as they are written
        rename <file> <name> <new>         Rename a declaration where the file uses it
                                           and where stored records name it, once both
                                           check: <name> as dxn writes it (Hover,
                                           Hover.rest, Toolbar.layout, Phone, ...;
                                           <kind>:<name> where one name names two), or
                                           <file>:<line>:<column> <new> by its place; a
                                           record's stored records move to the folder of
                                           its new name; with --dry-run, say what it
                                           would write

        help [<command>]                   Show this overview, or a command's usage

      Run "dxn help <command>" (or "dxn <command> --help") for a command's usage
      and options. The language is explained in docs/language/guide.md, in the dxn
      repository.

      Options:
        --dry-run                          Print the files a command would write,
                                           without writing them
        -h, --help                         Show this help
        -V, --version                      Print version information as JSON
      ",
      ]
    `);
  });

  // The overview, snapshotted once above; the tests below compare with it.
  it("prints usage when no arguments are given", () => {
    const result = capture([]);
    expect([result.code, result.stdout]).toEqual([0, capture(["--help"]).stdout]);
  });

  it("rejects an unknown command with exit code 2", () => {
    const result = capture(["frobnicate"]);
    expect([result.code, result.stderr, result.stdout]).toEqual([
      2,
      `dxn: unknown command: frobnicate\n\n${capture(["--help"]).stdout}`,
      "",
    ]);
  });
});

describe("the command surface", () => {
  it("lists the language's commands at the top", () => {
    const overview = capture([]).stdout;
    const commands = [...overview.matchAll(/^ {2}([a-z][a-z-]*)/gm)].map((match) => match[1]);
    expect(commands).toEqual([
      "check",
      "fmt",
      "states",
      "cases",
      "validate",
      "attach",
      "status",
      "review",
      "rename",
      "help",
    ]);
  });

  it("runs the language's status for a .dxn file at the top", () => {
    const root = writeProject({});
    writeFileSync(
      join(root, "toolbar.dxn"),
      "type Toolbar {}\nrecord Evidence {}\nactor EvidenceRecorder records Evidence\n",
    );
    mkdirSync(join(root, "evidence"));
    writeFileSync(join(root, "evidence", "toolbar.json"), "[]");
    const result = capture(["status", "toolbar.dxn"], root);
    expect([result.code, result.stdout.split(";")[0]]).toEqual([
      0,
      "toolbar.dxn: Evidence for 0 of 1 combination",
    ]);
  });
});
