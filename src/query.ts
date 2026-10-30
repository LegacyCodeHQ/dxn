import { compile } from "./compiler/compile.js";
import { readSource } from "./compiler/read.js";
import type { Io } from "./io.js";
import { findTask } from "./tree.js";

export const queryUsage = "Usage: task-tree query <tree.json> <task-id>\n";

export function query(args: string[], io: Io): number {
  const [path, id] = args;
  if (path === undefined || id === undefined) {
    io.stderr(queryUsage);
    return 2;
  }
  const read = readSource(path);
  if (!read.ok) {
    io.stderr(`${path}:1:1: ${read.code}: ${read.message}\n`);
    return 1;
  }
  const { document: tree, diagnostics } = compile(read.source);
  if (tree === undefined) {
    for (const { line, column, code, message } of diagnostics) {
      io.stderr(`${path}:${line}:${column}: ${code}: ${message}\n`);
    }
    return 1;
  }
  const task = findTask(tree.tasks, id);
  if (task === undefined) {
    io.stderr(`task-tree: task not found: ${id}\n`);
    return 1;
  }
  const states = task.type === undefined ? [] : (tree.types?.[task.type]?.states ?? []);
  const result = {
    id: task.id,
    title: task.title,
    ...(task.type === undefined ? {} : { type: task.type }),
    states,
  };
  io.stdout(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}
