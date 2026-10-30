import { join } from "node:path";
import { compileDirectory } from "./compiler/compile.js";
import type { Io } from "./io.js";
import { findTask } from "./tree.js";

export const queryUsage = "Usage: task-tree query <directory> <task-id>\n";

export function query(args: string[], io: Io): number {
  const [directory, id] = args;
  if (directory === undefined || id === undefined) {
    io.stderr(queryUsage);
    return 2;
  }
  const { project, diagnostics } = compileDirectory(directory);
  if (project === undefined) {
    for (const { file, line, column, code, message } of diagnostics) {
      io.stderr(`${join(directory, file)}:${line}:${column}: ${code}: ${message}\n`);
    }
    return 1;
  }
  const task = findTask([...project.tasks, ...project.components], id);
  if (task === undefined) {
    io.stderr(`task-tree: task not found: ${id}\n`);
    return 1;
  }
  const states = task.type === undefined ? [] : (project.types.types?.[task.type]?.states ?? []);
  const result = {
    id: task.id,
    title: task.title,
    ...(task.type === undefined ? {} : { type: task.type }),
    states,
  };
  io.stdout(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}
