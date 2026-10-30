import type { Io } from "./io.js";
import { findTask, loadTree } from "./tree.js";

export const queryUsage = "Usage: task-tree query <tree.json> <task-id>\n";

export function query(args: string[], io: Io): number {
  const [path, id] = args;
  if (path === undefined || id === undefined) {
    io.stderr(queryUsage);
    return 2;
  }
  const tree = loadTree(path);
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
