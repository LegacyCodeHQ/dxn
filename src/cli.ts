import type { Io } from "./io.js";
import { query } from "./query.js";
import { version } from "./version.js";

export type { Io } from "./io.js";

const usage = `Usage: task-tree <command> [options]

Commands:
  query <tree.json> <task-id>  Show a task and the states it has

Options:
  -h, --help     Show this help
  -V, --version  Print version information as JSON
`;

export function run(argv: string[], io: Io): number {
  const [first] = argv;
  if (first === undefined || first === "-h" || first === "--help") {
    io.stdout(usage);
    return 0;
  }
  if (first === "-V" || first === "--version") {
    io.stdout(`${JSON.stringify({ version })}\n`);
    return 0;
  }
  if (first === "query") {
    return query(argv.slice(1), io);
  }
  io.stderr(`task-tree: unknown command: ${first}\n\n${usage}`);
  return 2;
}
