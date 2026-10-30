import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { FileDiagnostic } from "./compiler/compile.js";
import type { Io } from "./io.js";

export const projectFolder = ".dimensions";

// Options every command accepts, wherever they appear.
export interface Global {
  // The project directory from --dir, resolved against the working directory.
  dir?: string;
  // From --dry-run: print what would be written instead of writing it.
  dryRun: boolean;
  args: string[];
}

export function parseGlobal(argv: string[], cwd: string): Global | { error: string } {
  const args: string[] = [];
  let dir: string | undefined;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg !== "--dir") {
      args.push(arg);
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      return { error: "--dir needs a directory" };
    }
    dir = resolve(cwd, value);
    i++;
  }
  return dir === undefined ? { dryRun, args } : { dir, dryRun, args };
}

// The project: --dir, or the nearest .dimensions directory from cwd upward.
export function findProject(cwd: string, dir: string | undefined): string | undefined {
  if (dir !== undefined) {
    return dir;
  }
  for (let current = resolve(cwd); ; current = dirname(current)) {
    const candidate = join(current, projectFolder);
    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
      return candidate;
    }
    if (dirname(current) === current) {
      return undefined;
    }
  }
}

// Resolves the project for a command, reporting when there is none.
export function requireProject(io: Io, cwd: string, dir: string | undefined): string | undefined {
  const project = findProject(cwd, dir);
  if (project === undefined) {
    io.stderr(
      `dimensions: no ${projectFolder} directory in ${resolve(cwd)} or above; run dimensions init\n`,
    );
  }
  return project;
}

export function printDiagnostics(io: Io, project: string, diagnostics: FileDiagnostic[]): void {
  for (const { file, line, column, code, message } of diagnostics) {
    io.stderr(`${join(project, file)}:${line}:${column}: ${code}: ${message}\n`);
  }
}
