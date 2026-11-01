import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// Builds throwaway directories. Values are written as JSON; strings
// and Buffers are written as-is, for syntax and encoding cases.
export type Files = Record<string, unknown>;

const directories: string[] = [];

export function cleanup(): void {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function writeProject(files: Files): string {
  const directory = mkdtempSync(join(tmpdir(), "dxn-"));
  directories.push(directory);
  for (const [name, content] of Object.entries(files)) {
    const path = join(directory, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      typeof content === "string" || Buffer.isBuffer(content)
        ? content
        : JSON.stringify(content, null, 2),
    );
  }
  return directory;
}
