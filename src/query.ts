import type { Context } from "./commands/context.js";
import { compileDirectory } from "./compiler/compile.js";
import { printDiagnostics, requireProject } from "./project.js";
import { findTask } from "./tree.js";

export const queryUsage = "Usage: task-tree query <task-id> [--dir <directory>]\n";

export function query(args: string[], { io, cwd, dir }: Context): number {
  const [id, ...rest] = args;
  if (id === undefined || rest.length > 0) {
    io.stderr(queryUsage);
    return 2;
  }
  const project = requireProject(io, cwd, dir);
  if (project === undefined) {
    return 1;
  }
  const { project: model, diagnostics } = compileDirectory(project);
  if (model === undefined) {
    printDiagnostics(io, project, diagnostics);
    return 1;
  }
  const task = findTask([...model.tasks, ...model.components], id);
  if (task === undefined) {
    io.stderr(`task-tree: task not found: ${id}\n`);
    return 1;
  }
  const states = task.type === undefined ? [] : (model.types.types?.[task.type]?.states ?? []);
  const result = {
    id: task.id,
    title: task.title,
    ...(task.type === undefined ? {} : { type: task.type }),
    states,
  };
  io.stdout(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}
