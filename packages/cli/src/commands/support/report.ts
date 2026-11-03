import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { Context } from "@cli/commands/support/context.js";
import { usage } from "@cli/commands/support/usage.js";
import { type Diagnostic, type ParseResult, parse } from "@legacycodehq/dxn-language";

// A problem in a file or in its stored data, as text or as JSON.
export interface Problem {
  file: string;
  line: number;
  column: number;
  severity: "error" | "warning";
  code: string;
  path?: string;
  message: string;
}

// What a command reports, readable by default and one JSON document with
// --json: problems as they come, then a refusal, a failure or the result.
export class Reporter {
  readonly problems: Problem[] = [];

  constructor(
    private readonly io: Context["io"],
    private readonly json: boolean,
    private readonly file: string,
  ) {}

  problem(problem: Problem): void {
    this.problems.push(problem);
    if (this.json) return;
    const { file, line, column, severity, code, path, message } = problem;
    const at = path === undefined ? "" : `${path}: `;
    this.io.stderr(`${file}:${line}:${column}: ${severity}: ${code}: ${at}${message}\n`);
  }

  get failed(): boolean {
    return this.problems.some(({ severity }) => severity === "error");
  }

  // The command cannot do what was asked.
  refuse(...messages: string[]): number {
    // With --json, the problems found before the refusal stay with its error.
    const found = this.problems.length > 0 ? { problems: this.problems } : {};
    if (this.json) {
      this.io.stdout(`${JSON.stringify({ error: messages.join("; "), ...found }, null, 2)}\n`);
    } else for (const message of messages) this.io.stderr(`dxn: ${message}\n`);
    return 1;
  }

  // The file or its data has problems, already reported.
  fail(): number {
    if (this.json) {
      this.io.stdout(`${JSON.stringify({ file: this.file, problems: this.problems }, null, 2)}\n`);
    }
    return 1;
  }

  // What a command found, said as succeed says it, with the problems found
  // too: a failure, the exit code 1, when one of them is an error.
  finish(result: object, text: string): number {
    this.succeed(result, text);
    return this.failed ? 1 : 0;
  }
  succeed(result: object, text: string): number {
    if (this.json) {
      this.io.stdout(`${JSON.stringify({ ...result, problems: this.problems }, null, 2)}\n`);
    } else {
      this.io.stdout(text);
    }
    return 0;
  }
}

// The arguments without --json, and whether it was given.
export function options(args: string[]): { json: boolean; rest: string[] } {
  return { json: args.includes("--json"), rest: args.filter((arg) => arg !== "--json") };
}

// A command given too little or too much: why, and the usage, exit 2; with
// --json, why, as a refusal says it.
export function misused(
  io: { stdout: (text: string) => void; stderr: (text: string) => void },
  json: boolean,
  message: string,
): number {
  if (json) io.stdout(`${JSON.stringify({ error: message }, null, 2)}\n`);
  io.stderr(`dxn: ${message}\n\n${usage}`);
  return 2;
}

// A count of things, singular or plural: "1 record", "3 records".
export const count = (n: number, thing: string) => `${n} ${thing}${n === 1 ? "" : "s"}`;

// Names with their values, in words: "Pointer = mouse, hover = rest".
export const assignments = (pairs: [string, string][]) =>
  pairs.map(([name, value]) => `${name} = ${value}`).join(", ");

// Reads and parses a file, reporting its problems, or those it keeps; the
// exit code when it cannot be used.
export function read(
  file: string,
  cwd: string,
  report: Reporter,
  keep: (diagnostic: Diagnostic, parsed: ParseResult) => boolean = () => true,
): ParseResult | number {
  const path = resolve(cwd, file);
  if (statSync(path, { throwIfNoEntry: false })?.isFile() !== true) {
    return report.refuse(`file not found: ${JSON.stringify(file)}`);
  }
  const parsed = parse(readFileSync(path, "utf8"));
  for (const diagnostic of parsed.diagnostics.filter((each) => keep(each, parsed))) {
    const { line, column, severity, code, message } = diagnostic;
    report.problem({ file, line, column, severity, code, message });
  }
  return report.failed ? report.fail() : parsed;
}
