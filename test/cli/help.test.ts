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
          "Usage: dimensions contexts <node-id> [<name>=<value>...] [--subtree] [--root <root-id>]",
        ],
        [
          0,
          "",
          "Usage: dimensions verify <node-id> --check <name> --result passed|failed --actor <role>",
        ],
        [
          0,
          "",
          "Usage: dimensions init [--dir <directory>]",
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
        "Usage: dimensions node <subcommand>",
        "Usage: dimensions node <subcommand>",
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
    expect(result.stdout).toContain("dimensions help <command>");
    expect(result.stdout).toContain("docs/");
  });

  it("rejects help for an unknown command", () => {
    expect(help("help", "nope")).toMatchInlineSnapshot(`
      {
        "code": 2,
        "stderr": "dimensions: unknown command: nope

      Usage: dimensions <command> [options]

      Project
        workflow            Print the step-by-step guide to building a model; start here
        init                Create a .dimensions project in the working directory
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

      To build a model, start with "dimensions workflow": it prints the step-by-step
      guide as Markdown. Run "dimensions help <command>" (or "dimensions <command>
      --help") for a command's options. The docs/ folder of the dimensions package
      also explains the concepts, every command, every diagnostic code and the JSON
      output.

      Options:
        --dir <directory>   Use this project directory instead of the nearest .dimensions
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
      expect([command, result.code, result.stdout.startsWith("Usage: dimensions")]).toEqual([
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
          "                        [<group>=<value>...] [<dimension>=<value>...] [<shared-node>=<state>...]",
          "each of the node's state groups (state=<state> for a plain states list, or",
          "<node-id>=<state> for a shared node, as contexts names it) and the states of",
        ],
        [
          "                          [<shared-node>=<state>...] [--transition <id>] [--root <root-id>]",
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
