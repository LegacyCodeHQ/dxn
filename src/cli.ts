import { attribute } from "./commands/attribute.js";
import type { Command } from "./commands/context.js";
import { init } from "./commands/init.js";
import { task } from "./commands/task.js";
import { type } from "./commands/type.js";
import { validate } from "./commands/validate.js";
import type { Io } from "./io.js";
import { parseGlobal } from "./project.js";
import { query } from "./query.js";
import { version } from "./version.js";

export type { Io } from "./io.js";

const usage = `Usage: task-tree <command> [options]

Commands:
  init                Create a .task-tree project in the working directory
  validate            Compile the project and report every error
  query <task-id>     Show a task and the states it has
  task <subcommand>   Add, move, rename and remove tasks, and set their values
  type <subcommand>   Add types and states, and set their values
  attribute <subcommand>
                      Declare custom attributes and their values

Options:
  --dir <directory>   Use this project directory instead of the nearest .task-tree
  --dry-run           Print the files a command would write, without writing them
  -h, --help          Show this help
  -V, --version       Print version information as JSON
`;

const commands: Record<string, Command> = { init, validate, query, task, type, attribute };

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
