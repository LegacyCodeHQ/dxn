import type { Io } from "../io.js";

// What every command receives besides its own arguments.
export interface Context {
  io: Io;
  cwd: string;
  // From --dir, resolved against cwd.
  dir: string | undefined;
  dryRun: boolean;
}

// A command, with the usage text --help and "help <command>" print. A command
// that is a set of commands of its own, such as prototype, also has them.
export type Command = ((args: string[], context: Context) => number) & {
  usage: string;
  commands?: Record<string, Command>;
};

export function command(usage: string, run: (args: string[], context: Context) => number): Command {
  return Object.assign(run, { usage });
}

// A set of commands, run as "<name> <command> ...", with usage as its
// overview.
export function commandSet(usage: string, commands: Record<string, Command>): Command {
  const run = (args: string[], context: Context) => dispatch(args, context, usage, commands);
  return Object.assign(run, { usage, commands });
}

// Runs the command args name, from commands, with the rest of args. With no
// command, -h or --help, prints the overview, usage; help <command> prints
// the command's usage.
export function dispatch(
  args: string[],
  context: Context,
  usage: string,
  commands: Record<string, Command>,
): number {
  const { io } = context;
  const [first, ...rest] = args;
  if (first === undefined || first === "-h" || first === "--help") {
    io.stdout(usage);
    return 0;
  }
  if (first === "help") {
    // help <command> [<subcommand>]: the command's usage; help alone: the
    // overview.
    const [name] = rest.filter((arg) => arg !== "--help" && arg !== "-h");
    if (name === undefined) {
      io.stdout(usage);
      return 0;
    }
    const target = commands[name];
    if (target === undefined) {
      io.stderr(`dxn: unknown command: ${name}\n\n${usage}`);
      return 2;
    }
    io.stdout(target.usage);
    return 0;
  }
  const command = commands[first];
  if (command === undefined) {
    io.stderr(`dxn: unknown command: ${first}\n\n${usage}`);
    return 2;
  }
  // A set of commands reads its own help, one level down.
  if (command.commands !== undefined) {
    return command(rest, context);
  }
  // --help anywhere after a command prints its usage; no project needed.
  if (rest.includes("--help") || rest.includes("-h")) {
    io.stdout(command.usage);
    return 0;
  }
  return command(rest, context);
}
