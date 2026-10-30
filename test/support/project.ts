import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { compileDirectory } from "../../src/compiler/compile.js";

// Builds throwaway project directories. Values are written as JSON; strings
// and Buffers are written as-is, for syntax and encoding cases.
export type Files = Record<string, unknown>;

const directories: string[] = [];

export function cleanup(): void {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function writeProject(files: Files): string {
  const directory = mkdtempSync(join(tmpdir(), "dimensions-"));
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

export function compileFiles(files: Files) {
  return compileDirectory(writeProject(files));
}

export function diagnose(files: Files) {
  return compileFiles(files).diagnostics.map(({ file, code, path }) => ({ file, code, path }));
}

export function at(file: string) {
  return (code: string, path: string) => ({ file, code, path });
}

export const types = {
  version: 1,
  attributes: { design: { values: ["available", "missing"] } },
  types: { link: { states: ["normal", "hovered", "selected"] } },
};

export const rootFile = (root: unknown) => ({ version: 1, root });

// A small project: two root files, one of them outside the pointer scope.
export const tree: Files = {
  "types.json": types,
  "roots/page.json": rootFile({
    id: "page",
    title: "Page",
    children: [
      {
        id: "toolbar",
        title: "Toolbar",
        children: [
          { id: "blog-link", title: "Blog link", type: "link" },
          { id: "logo", title: "Logo" },
        ],
      },
    ],
  }),
  "roots/footer-link.json": rootFile({ id: "footer-link", title: "Footer link", type: "link" }),
};

export const pointer = { version: 1, values: ["mouse", "touch"], appliesTo: ["page"] };
