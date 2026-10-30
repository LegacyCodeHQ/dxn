import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { projectFolder } from "../project.js";
import type { Context } from "./context.js";

export const initUsage = "Usage: task-tree init [--dir <directory>]\n";

// Creates the project: .task-tree/ in the working directory, or --dir.
export function init(args: string[], { io, cwd, dir }: Context): number {
  if (args.length > 0) {
    io.stderr(initUsage);
    return 2;
  }
  const project = dir ?? join(cwd, projectFolder);
  if (existsSync(project)) {
    io.stderr(`task-tree: ${project} already exists\n`);
    return 1;
  }
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "types.json"), `${JSON.stringify({ version: 1 }, null, 2)}\n`);
  io.stdout(`${JSON.stringify({ created: project })}\n`);
  return 0;
}
