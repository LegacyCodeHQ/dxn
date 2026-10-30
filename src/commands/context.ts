import type { Io } from "../io.js";

// What every command receives besides its own arguments.
export interface Context {
  io: Io;
  cwd: string;
  // From --dir, resolved against cwd.
  dir: string | undefined;
  dryRun: boolean;
}

// A command, with the usage text --help and "help <command>" print.
export type Command = ((args: string[], context: Context) => number) & { usage: string };

export function command(usage: string, run: (args: string[], context: Context) => number): Command {
  return Object.assign(run, { usage });
}
