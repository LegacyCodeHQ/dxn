import { afterAll, describe, expect, it } from "vitest";
import { capture } from "../support/cli.js";
import { cleanup, writeProject } from "../support/project.js";

afterAll(cleanup);

// Help needs no file, so run it in an empty directory.
const outside = () => writeProject({});
const help = (...argv: string[]) => capture(argv, outside());

describe("help", () => {
  it("prints a command's usage with --help, -h or help <command>", () => {
    const usage = help("check", "--help");
    expect([usage.code, usage.stderr, usage.stdout.split("\n")[0]]).toEqual([
      0,
      "",
      "Usage: dxn <command> <file> [options]",
    ]);
    expect(help("states", "-h").stdout).toBe(usage.stdout);
    expect(help("help", "cases").stdout).toBe(usage.stdout);
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
                                           are printed, but do not fail.
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
      expect([command, result.code, result.stdout.startsWith("Usage: dxn")]).toEqual([
        command,
        0,
        true,
      ]);
    }
  });
});
