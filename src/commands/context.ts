import type { Io } from "../io.js";

// What every command receives besides its own arguments.
export interface Context {
  io: Io;
  cwd: string;
  // From --dir, resolved against cwd.
  dir: string | undefined;
  dryRun: boolean;
}

export type Command = (args: string[], context: Context) => number;
