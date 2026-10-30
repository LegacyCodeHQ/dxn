import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { compileDirectory } from "./compiler/compile.js";
import { formatJson } from "./format.js";
import type { Io } from "./io.js";
import { printDiagnostics } from "./project.js";

export type Json = Record<string, unknown>;

// The project's files as JSON, with the changes a command makes. commit()
// compiles the changed project in a temporary copy and writes the changes
// only when it compiles without errors.
export class Workspace {
  private readonly loaded = new Map<string, Json>();
  private readonly written = new Set<string>();
  private readonly removed = new Set<string>();

  constructor(readonly project: string) {}

  // Relative paths of the .json files directly in a folder, sorted.
  list(folder: string): string[] {
    const onDisk = existsSync(join(this.project, folder))
      ? readdirSync(join(this.project, folder))
          .filter((name) => name.endsWith(".json"))
          .map((name) => `${folder}/${name}`)
          .filter((path) => statSync(join(this.project, path)).isFile())
      : [];
    const added = [...this.written].filter((path) => dirname(path) === folder);
    return [...new Set([...onDisk, ...added])].filter((path) => !this.removed.has(path)).sort();
  }

  exists(path: string): boolean {
    return (
      this.written.has(path) || (!this.removed.has(path) && existsSync(join(this.project, path)))
    );
  }

  // The file's JSON, or undefined when it does not exist. Throws
  // UnreadableFile when it is not valid JSON.
  read(path: string): Json | undefined {
    const cached = this.loaded.get(path);
    if (cached !== undefined) {
      return cached;
    }
    if (!this.exists(path)) {
      return undefined;
    }
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(join(this.project, path), "utf8"));
    } catch {
      throw new UnreadableFile(path);
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new UnreadableFile(path);
    }
    this.loaded.set(path, value as Json);
    return value as Json;
  }

  write(path: string, value: Json): void {
    this.loaded.set(path, value);
    this.written.add(path);
    this.removed.delete(path);
  }

  // Marks a file changed after its JSON was edited in place.
  touch(path: string): void {
    const value = this.read(path);
    if (value !== undefined) {
      this.write(path, value);
    }
  }

  remove(path: string): void {
    this.loaded.delete(path);
    this.written.delete(path);
    this.removed.add(path);
  }

  move(from: string, to: string): void {
    const value = this.read(from);
    if (value !== undefined) {
      this.remove(from);
      this.write(to, value);
    }
  }

  commit(io: Io, dryRun: boolean): number {
    const written = [...this.written].sort();
    const removed = [...this.removed].filter((path) => existsSync(join(this.project, path))).sort();
    const scratch = mkdtempSync(join(tmpdir(), "task-tree-commit-"));
    try {
      const copy = join(scratch, "project");
      cpSync(this.project, copy, { recursive: true });
      this.apply(copy, written, removed);
      const { diagnostics } = compileDirectory(copy);
      if (diagnostics.length > 0) {
        printDiagnostics(io, this.project, diagnostics);
        return 1;
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
    if (dryRun) {
      io.stdout(
        `${JSON.stringify({
          dryRun: true,
          written: Object.fromEntries(
            written.map((path) => [path, formatJson(this.loaded.get(path))]),
          ),
          removed,
        })}\n`,
      );
      return 0;
    }
    this.apply(this.project, written, removed);
    io.stdout(`${JSON.stringify({ written, removed })}\n`);
    return 0;
  }

  // Writes each file through a temporary file and a rename, so a crash
  // never leaves one half-written.
  private apply(root: string, written: string[], removed: string[]): void {
    for (const path of written) {
      const target = join(root, path);
      mkdirSync(dirname(target), { recursive: true });
      const temporary = `${target}.${process.pid}.tmp`;
      writeFileSync(temporary, formatJson(this.loaded.get(path)));
      renameSync(temporary, target);
    }
    for (const path of removed) {
      rmSync(join(root, path), { force: true });
    }
  }
}

export class UnreadableFile extends Error {
  constructor(readonly path: string) {
    super(`${path} is not a JSON object; run task-tree validate`);
  }
}
