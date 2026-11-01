import { type Command, dispatch } from "./commands/context.js";
import { language } from "./commands/lang.js";
import type { Io } from "./io.js";
import { version } from "./version.js";

export type { Io } from "./io.js";

const usage = `Usage: dxn <command> [options]

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
`;

const commands: Record<string, Command> = language;

export function run(argv: string[], io: Io): number {
  const cwd = io.cwd ?? process.cwd();
  // --dry-run is accepted wherever it appears, before or after the command.
  const dryRun = argv.includes("--dry-run");
  const args = argv.filter((arg) => arg !== "--dry-run");
  const [first] = args;
  if (first === "-V" || first === "--version") {
    io.stdout(`${JSON.stringify({ version })}\n`);
    return 0;
  }
  return dispatch(args, { io, cwd, dryRun }, usage, commands);
}
