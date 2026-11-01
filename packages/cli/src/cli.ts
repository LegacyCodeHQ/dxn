import { type Command, dispatch } from "./commands/context.js";
import { language } from "./commands/lang.js";
import { prototype } from "./commands/prototype.js";
import type { Io } from "./io.js";
import { parseGlobal } from "./project.js";
import { version } from "./version.js";

export type { Io } from "./io.js";

const usage = `Usage: dxn <command> [options]

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
`;

// The language's commands at the top, and the JSON prototype's under one
// command of its own.
const commands: Record<string, Command> = { ...language, prototype };

export function run(argv: string[], io: Io): number {
  const cwd = io.cwd ?? process.cwd();
  const global = parseGlobal(argv, cwd);
  if ("error" in global) {
    io.stderr(`dxn: ${global.error}\n\n${usage}`);
    return 2;
  }
  const [first] = global.args;
  if (first === "-V" || first === "--version") {
    io.stdout(`${JSON.stringify({ version })}\n`);
    return 0;
  }
  return dispatch(
    global.args,
    { io, cwd, dir: global.dir, dryRun: global.dryRun },
    usage,
    commands,
  );
}
