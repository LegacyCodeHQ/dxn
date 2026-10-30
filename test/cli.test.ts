import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { capture } from "./support/cli.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

describe("dimensions cli", () => {
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
        "Usage: dimensions <command> [options]

      Project
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

      Record
        verify <node-id> --check <c> --result passed|failed --by <who> [<context>...]
                            Record a check's result for a node in one context
        unverify <node-id> --check <c> [<context>...]
                            Remove that record

      Model
        node <subcommand>   Add, move, rename and remove nodes; say where they exist
        fragment <subcommand>
                            Add, extract and remove reusable fragments
        type <subcommand>   List and add types and states, and set their values
        state-group <subcommand>
                            List and declare groups of states that exclude each other
        attribute <subcommand>
                            List and declare custom attributes and their values
        check <subcommand>  List and declare checks that types can require
        dimension <subcommand>
                            List and add dimensions, their values, default and scope
        override <subcommand>
                            Change states and values for a dimension value or combination

        help [<command>]    Show this overview, or a command's usage

      Run "dimensions help <command>" (or "dimensions <command> --help") for a command's
      options. The docs/ folder of the dimensions package explains the concepts
      (concepts.md), every command (commands.md), every diagnostic code
      (diagnostics.md) and the JSON output (output.md).

      Options:
        --dir <directory>   Use this project directory instead of the nearest .dimensions
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
        "Usage: dimensions <command> [options]

      Project
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

      Record
        verify <node-id> --check <c> --result passed|failed --by <who> [<context>...]
                            Record a check's result for a node in one context
        unverify <node-id> --check <c> [<context>...]
                            Remove that record

      Model
        node <subcommand>   Add, move, rename and remove nodes; say where they exist
        fragment <subcommand>
                            Add, extract and remove reusable fragments
        type <subcommand>   List and add types and states, and set their values
        state-group <subcommand>
                            List and declare groups of states that exclude each other
        attribute <subcommand>
                            List and declare custom attributes and their values
        check <subcommand>  List and declare checks that types can require
        dimension <subcommand>
                            List and add dimensions, their values, default and scope
        override <subcommand>
                            Change states and values for a dimension value or combination

        help [<command>]    Show this overview, or a command's usage

      Run "dimensions help <command>" (or "dimensions <command> --help") for a command's
      options. The docs/ folder of the dimensions package explains the concepts
      (concepts.md), every command (commands.md), every diagnostic code
      (diagnostics.md) and the JSON output (output.md).

      Options:
        --dir <directory>   Use this project directory instead of the nearest .dimensions
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
        "dimensions: unknown command: frobnicate

      Usage: dimensions <command> [options]

      Project
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

      Record
        verify <node-id> --check <c> --result passed|failed --by <who> [<context>...]
                            Record a check's result for a node in one context
        unverify <node-id> --check <c> [<context>...]
                            Remove that record

      Model
        node <subcommand>   Add, move, rename and remove nodes; say where they exist
        fragment <subcommand>
                            Add, extract and remove reusable fragments
        type <subcommand>   List and add types and states, and set their values
        state-group <subcommand>
                            List and declare groups of states that exclude each other
        attribute <subcommand>
                            List and declare custom attributes and their values
        check <subcommand>  List and declare checks that types can require
        dimension <subcommand>
                            List and add dimensions, their values, default and scope
        override <subcommand>
                            Change states and values for a dimension value or combination

        help [<command>]    Show this overview, or a command's usage

      Run "dimensions help <command>" (or "dimensions <command> --help") for a command's
      options. The docs/ folder of the dimensions package explains the concepts
      (concepts.md), every command (commands.md), every diagnostic code
      (diagnostics.md) and the JSON output (output.md).

      Options:
        --dir <directory>   Use this project directory instead of the nearest .dimensions
        --dry-run           Print the files a command would write, without writing them
        -h, --help          Show this help
        -V, --version       Print version information as JSON
      ",
        "",
      ]
    `);
  });
});
