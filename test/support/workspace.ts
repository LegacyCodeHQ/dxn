import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { capture } from "./cli.js";
import { type Files, writeProject } from "./project.js";

// A project under .task-tree/ with helpers to run commands and read files.
export function cliProject(files: Files) {
  const root = writeProject(
    Object.fromEntries(
      Object.entries(files).map(([name, content]) => [`.task-tree/${name}`, content]),
    ),
  );
  return {
    root,
    run: (...argv: string[]) => capture(argv, root),
    read: (name: string) =>
      JSON.parse(readFileSync(join(root, ".task-tree", name), "utf8")) as Record<string, unknown>,
    exists: (name: string) => existsSync(join(root, ".task-tree", name)),
  };
}
