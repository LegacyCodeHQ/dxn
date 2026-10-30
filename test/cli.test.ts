import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { capture } from "./support/cli.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

describe("task-tree cli", () => {
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
        "Usage: task-tree <command> [options]

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
      ]
    `);
  });

  it("prints usage when no arguments are given", () => {
    const snapshot: unknown[] = [];
    const result = capture([]);
    snapshot.push(result.code);
    snapshot.push(result.stdout);

    expect(snapshot).toMatchInlineSnapshot(`
      [
        0,
        "Usage: task-tree <command> [options]

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
      ]
    `);
  });

  it("rejects an unknown command with exit code 2", () => {
    const snapshot: unknown[] = [];
    const result = capture(["frobnicate"]);
    snapshot.push(result.code);
    snapshot.push(result.stderr);
    snapshot.push(result.stdout);

    expect(snapshot).toMatchInlineSnapshot(`
      [
        2,
        "task-tree: unknown command: frobnicate

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
        "",
      ]
    `);
  });
});
