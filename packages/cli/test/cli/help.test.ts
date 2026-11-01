import { afterAll, describe, expect, it } from "vitest";
import { capture } from "../support/cli.js";
import { cleanup, writeProject } from "../support/project.js";

afterAll(cleanup);

// Help never needs a project, so run it where there is none.
const outside = () => writeProject({});
const help = (...argv: string[]) => capture(argv, outside());

describe("help", () => {
  it("prints a command's usage with --help or -h, without a project", () => {
    const snapshot: unknown[] = [];
    for (const argv of [
      ["prototype", "contexts", "--help"],
      ["prototype", "verify", "-h"],
      ["prototype", "init", "--help"],
    ]) {
      const result = help(...argv);
      snapshot.push([result.code, result.stderr, result.stdout.split("\n")[0]]);
    }
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          0,
          "",
          "Usage: dxn prototype contexts <node-id> [<name>=<value>...] [--subtree] [--root <root-id>]",
        ],
        [
          0,
          "",
          "Usage: dxn prototype verify <node-id> --check <name> --result passed|failed --actor <role>",
        ],
        [
          0,
          "",
          "Usage: dxn prototype init [--dir <directory>]",
        ],
      ]
    `);
  });

  it("prints a command group's usage for the group and its subcommands", () => {
    const snapshot: unknown[] = [];
    snapshot.push(help("prototype", "node", "--help").stdout.split("\n")[0]);
    snapshot.push(help("prototype", "node", "add", "--help").stdout.split("\n")[0]);
    snapshot.push(help("prototype", "dimension", "add", "-h").code);
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "Usage: dxn prototype node <subcommand>",
        "Usage: dxn prototype node <subcommand>",
        0,
      ]
    `);
  });

  it("prints the same usage with help <command>", () => {
    expect(help("prototype", "help", "contexts").stdout).toBe(
      help("prototype", "contexts", "--help").stdout,
    );
    expect(help("prototype", "help", "node", "add").stdout).toBe(
      help("prototype", "node", "--help").stdout,
    );
  });

  it("prints the overview with help alone, pointing to the docs", () => {
    const result = help("help");
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(help("--help").stdout);
    expect(result.stdout).toContain("dxn help <command>");
    expect(result.stdout).toContain("docs/");
  });

  it("rejects help for an unknown command", () => {
    expect(help("help", "nope")).toMatchInlineSnapshot(`
      {
        "code": 2,
        "stderr": "dxn: unknown command: nope

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
        "stdout": "",
      }
    `);
  });

  it("documents every command, and every command of the prototype", () => {
    for (const prefix of [[], ["prototype"]]) {
      const overview = help(...prefix, "--help").stdout;
      const commands = [...overview.matchAll(/^ {2}([a-z][a-z-]*)/gm)].map(
        (match) => match[1] as string,
      );
      for (const command of commands) {
        const result = help(...prefix, command, "--help");
        expect([command, result.code, result.stdout.startsWith("Usage: dxn")]).toEqual([
          command,
          0,
          true,
        ]);
      }
    }
  });
});

describe("usage text", () => {
  it("names contexts by state group, as records and queries do", () => {
    const snapshot: unknown[] = [];
    for (const name of ["verify", "unverify"]) {
      snapshot.push(
        help("prototype", name, "--help")
          .stdout.split("\n")
          .filter((line) => line.includes("state")),
      );
    }
    snapshot.push(help("prototype", "state-group", "--help").stdout.split("\n").slice(2, 5));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "                                  [<group>=<value>...] [<dimension>=<value>...] [<shared-node>=<state>...]",
          "each of the node's state groups (state=<state> for a plain states list, or",
          "<node-id>=<state> for a shared node, as contexts names it) and the states of",
        ],
        [
          "                                    [<shared-node>=<state>...] [--transition <id>] [--root <root-id>]",
        ],
        [
          "A state group is a named set of states that exclude each other, such as hover",
          "(rest, hovered) or selection (unselected, selected). A type can use several",
          "groups, which vary independently. Types use groups with "type add --groups" or",
        ],
      ]
    `);
  });
});
