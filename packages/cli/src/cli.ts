import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { version } from "@cli/version.js";
import { analyze, format, renameEnum, type Span } from "@legacycodehq/dxn-next";

export interface Io {
  stdout(text: string): void;
  stderr(text: string): void;
  cwd?: string;
}

const help = `Usage: dxn <command> <file> [options]

  check <file>                       Check the new DXN language
  fmt <file> [--check | --write]      Print, check or write canonical formatting
  rename <file> <old> <new>           Rename an enumeration

Options: --json, --dry-run (rename), --help, --version
Supported syntax: enum Light { off, on }
`;

// Files and streams belong here; language decisions belong to packages/next.
export function run(argv: string[], io: Io): number {
  const json = argv.includes("--json");
  const emit = (data: unknown, text: string, error = false) => {
    if (json) io.stdout(`${JSON.stringify(data)}\n`);
    else (error ? io.stderr : io.stdout)(`${text}\n`);
  };
  if (argv.length === 0 || argv.includes("--help") || argv[0] === "help") {
    io.stdout(help);
    return 0;
  }
  if (argv[0] === "--version" || argv[0] === "-V") {
    io.stdout(`${JSON.stringify({ version })}\n`);
    return 0;
  }
  const [command, ...args] = argv;
  const flags = args.filter((arg) => arg.startsWith("--"));
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const [file, from, to] = positional;
  const allowed =
    command === "check"
      ? ["--json"]
      : command === "fmt"
        ? ["--json", "--check", "--write"]
        : command === "rename"
          ? ["--json", "--dry-run"]
          : [];
  if (
    !file ||
    !["check", "fmt", "rename"].includes(command ?? "") ||
    flags.some((f) => !allowed.includes(f)) ||
    positional.length !== (command === "rename" ? 3 : 1) ||
    (flags.includes("--write") && flags.includes("--check"))
  ) {
    emit({ error: "invalid command or arguments" }, help, true);
    return 2;
  }
  const path = resolve(io.cwd ?? process.cwd(), file);
  let source: string;
  try {
    source = readFileSync(path, "utf8");
  } catch {
    emit({ file, error: "cannot read file" }, `${file}: cannot read file`, true);
    return 2;
  }
  const write = (text: string) => {
    try {
      writeFileSync(path, text);
      return true;
    } catch {
      emit({ file, error: "cannot write file" }, `${file}: cannot write file`, true);
      return false;
    }
  };
  if (command === "check") {
    const result = analyze(source);
    const located = result.problems.flatMap((p) =>
      p.at.map((span) => ({ code: p.code, message: p.message, span })),
    );
    emit(
      { file, problems: located },
      located.length
        ? located
            .map((p) => `${file}:${position(source, p.span)}: ${p.code}: ${p.message}`)
            .join("\n")
        : `${file}: valid`,
      located.length > 0,
    );
    return located.length ? 1 : 0;
  }
  if (command === "fmt") {
    const formatted = format(source);
    if (formatted === undefined) {
      emit(
        { file, problems: analyze(source).problems },
        `${file}: cannot format invalid syntax; run dxn check`,
        true,
      );
      return 1;
    }
    const changed = formatted !== source;
    if (flags.includes("--write") && changed && !write(formatted)) return 2;
    if (flags.includes("--check"))
      emit(
        { file, changed },
        changed ? `${file}: needs formatting` : `${file}: formatted`,
        changed,
      );
    else if (json) emit({ file, changed, source: formatted }, "");
    else if (!flags.includes("--write")) io.stdout(formatted);
    return flags.includes("--check") && changed ? 1 : 0;
  }
  const renamed = renameEnum(source, from as string, to as string);
  if (!renamed.file) {
    emit(
      { file, refusals: renamed.refusals },
      `${file}: rename refused: ${JSON.stringify(renamed.refusals)}`,
      true,
    );
    return 1;
  }
  const dryRun = flags.includes("--dry-run");
  if (!dryRun && renamed.edits.length && !write(renamed.source)) return 2;
  emit(
    { file, source: renamed.source, edits: renamed.edits, dryRun },
    dryRun ? renamed.source.trimEnd() : `${file}: renamed`,
  );
  return 0;
}

function position(source: string, span: Span): string {
  const prefix = source.slice(0, span.start).split(/\r\n|\r|\n/);
  return `${prefix.length}:${(prefix.at(-1)?.length ?? 0) + 1}`;
}
