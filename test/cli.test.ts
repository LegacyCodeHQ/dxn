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
        init                Create a .task-tree project in the working directory
        validate            Compile the project and report every error
        query <task-id> [<dimension>=<value>...]
                            Show a task's states and values in a context
        contexts <task-id>  List every context a task exists in
        status [<task-id>]  Report each required check as passed, failed or missing
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
        init                Create a .task-tree project in the working directory
        validate            Compile the project and report every error
        query <task-id> [<dimension>=<value>...]
                            Show a task's states and values in a context
        contexts <task-id>  List every context a task exists in
        status [<task-id>]  Report each required check as passed, failed or missing
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
        init                Create a .task-tree project in the working directory
        validate            Compile the project and report every error
        query <task-id> [<dimension>=<value>...]
                            Show a task's states and values in a context
        contexts <task-id>  List every context a task exists in
        status [<task-id>]  Report each required check as passed, failed or missing
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
