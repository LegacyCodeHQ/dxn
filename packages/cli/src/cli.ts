import { homedir } from "node:os";
import { join } from "node:path";
import { dispatch } from "./commands/context.js";
import { commandList, language } from "./commands/lang.js";
import type { Io } from "./io.js";
import { version } from "./version.js";

const usage = `Usage: dxn <command> [options]

Commands:
${commandList}

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
  return dispatch(args, { io, cwd, cache: io.cache ?? userCache(), dryRun }, usage, language);
}

// The user's cache folder for dxn: ~/Library/Caches/dxn on macOS, under
// LOCALAPPDATA on Windows, and elsewhere under XDG_CACHE_HOME or ~/.cache.
function userCache(): string {
  if (process.platform === "darwin") return join(homedir(), "Library", "Caches", "dxn");
  if (process.platform === "win32") {
    return join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "dxn");
  }
  return join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "dxn");
}
