import { attribute } from "./commands/attribute.js";
import { check } from "./commands/checks.js";
import { component } from "./commands/component.js";
import type { Command } from "./commands/context.js";
import { dimension } from "./commands/dimension.js";
import { init } from "./commands/init.js";
import { only, override } from "./commands/override.js";
import { contexts, query, status, tree, view, views } from "./commands/reading.js";
import { task } from "./commands/task.js";
import { type } from "./commands/type.js";
import { validate } from "./commands/validate.js";
import { unverify, verify } from "./commands/verify.js";
import type { Io } from "./io.js";
import { parseGlobal } from "./project.js";
import { version } from "./version.js";

export type { Io } from "./io.js";

const usage = `Usage: task-tree <command> [options]

Commands:
  init                Create a .task-tree project in the working directory
  validate            Compile the project and report every error
  query <task-id> [<dimension>=<value>...]
                      Show a task's states and values in a context
  contexts <task-id>  List every context a task exists in
  status [<task-id>]  Report each required check as passed, failed or missing
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
`;

const commands: Record<string, Command> = {
  init,
  validate,
  query,
  contexts,
  status,
  tree,
  views,
  view,
  task,
  type,
  attribute,
  check,
  component,
  dimension,
  only,
  override,
  verify,
  unverify,
};

export function run(argv: string[], io: Io): number {
  const cwd = io.cwd ?? process.cwd();
  const global = parseGlobal(argv, cwd);
  if ("error" in global) {
    io.stderr(`task-tree: ${global.error}\n\n${usage}`);
    return 2;
  }
  const [first, ...rest] = global.args;
  if (first === undefined || first === "-h" || first === "--help") {
    io.stdout(usage);
    return 0;
  }
  if (first === "-V" || first === "--version") {
    io.stdout(`${JSON.stringify({ version })}\n`);
    return 0;
  }
  const command = commands[first];
  if (command === undefined) {
    io.stderr(`task-tree: unknown command: ${first}\n\n${usage}`);
    return 2;
  }
  return command(rest, { io, cwd, dir: global.dir, dryRun: global.dryRun });
}
