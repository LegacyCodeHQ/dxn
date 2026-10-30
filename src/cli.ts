import { version } from "./version.js";

export interface Io {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const usage = `Usage: task-tree <command> [options]

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
  io.stderr(`task-tree: unknown command: ${first}\n\n${usage}`);
  return 2;
}
