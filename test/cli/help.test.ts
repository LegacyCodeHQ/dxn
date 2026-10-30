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
      ["contexts", "--help"],
      ["verify", "-h"],
      ["init", "--help"],
    ]) {
      const result = help(...argv);
      snapshot.push([result.code, result.stderr, result.stdout.split("\n")[0]]);
    }
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          0,
          "",
          "Usage: task-tree contexts <node-id> [<name>=<value>...] [--subtree] [--root <root-id>]",
        ],
        [
          0,
          "",
          "Usage: task-tree verify <node-id> --check <name> --result passed|failed --by <who>",
        ],
        [
          0,
          "",
          "Usage: task-tree init [--dir <directory>]",
        ],
      ]
    `);
  });

  it("prints a command group's usage for the group and its subcommands", () => {
    const snapshot: unknown[] = [];
    snapshot.push(help("node", "--help").stdout.split("\n")[0]);
    snapshot.push(help("node", "add", "--help").stdout.split("\n")[0]);
    snapshot.push(help("dimension", "add", "-h").code);
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "Usage: task-tree node <subcommand>",
        "Usage: task-tree node <subcommand>",
        0,
      ]
    `);
  });

  it("prints the same usage with help <command>", () => {
    expect(help("help", "contexts").stdout).toBe(help("contexts", "--help").stdout);
    expect(help("help", "node", "add").stdout).toBe(help("node", "--help").stdout);
  });

  it("prints the overview with help alone, pointing to the docs", () => {
    const result = help("help");
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(help("--help").stdout);
    expect(result.stdout).toContain("task-tree help <command>");
    expect(result.stdout).toContain("docs/");
  });

  it("rejects help for an unknown command", () => {
    expect(help("help", "nope")).toMatchInlineSnapshot(`
      {
        "code": 2,
        "stderr": "task-tree: unknown command: nope

      Usage: task-tree <command> [options]

      Commands:
        help [<command>]    Show this overview, or a command's usage
        init                Create a .task-tree project in the working directory
        validate            Compile the project and report every error
        query <node-id> [<dimension>=<value>...]
                            Show a node's states and values in a context
        contexts <node-id>  List every context a node exists in
        status [<node-id>]  Report each required check as passed, failed or missing
        transitions <node-id>
                            List how a shared node's state changes
        dimensions          List every dimension, its values, default and scope
        axes <node-id>      List what a view or query of a node accepts
        views <node-id>     List every distinct view of a node's subtree: one diagram each
        view <node-id> [<context>...]
                            Print the tree present in one view
        tree                Print the roots and components
        verify <node-id> --check <c> --result passed|failed --by <who> [<context>...]
                            Record a check's result for a node in one context
        unverify <node-id> --check <c> [<context>...]
                            Remove that record
        node <subcommand>   Add, move, rename and remove nodes, and set their values
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
        only <dimension> <node-id> <value>...
                            Say at which values of a dimension a node exists
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
        "stdout": "",
      }
    `);
  });

  it("documents every command", () => {
    const overview = help("--help").stdout;
    const commands = [...overview.matchAll(/^ {2}([a-z][a-z-]*)/gm)].map(
      (match) => match[1] as string,
    );
    for (const command of commands) {
      const result = help(command, "--help");
      expect([command, result.code, result.stdout.startsWith("Usage: task-tree")]).toEqual([
        command,
        0,
        true,
      ]);
    }
  });
});

describe("usage text", () => {
  it("names contexts by state group, as records and queries do", () => {
    const snapshot: unknown[] = [];
    for (const name of ["verify", "unverify"]) {
      snapshot.push(
        help(name, "--help")
          .stdout.split("\n")
          .filter((line) => line.includes("state")),
      );
    }
    snapshot.push(help("state-group", "--help").stdout.split("\n").slice(2, 5));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "                       [<group>=<value>...] [<dimension>=<value>...] [<shared-node>=<state>...]",
          "each of the node's state groups (state=<state> for a plain states list) and",
          "the states of shared nodes above it; dimensions left out take their default.",
        ],
        [
          "                         [<shared-node>=<state>...] [--transition <id>] [--root <root-id>]",
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
