import type { Command } from "./context.js";
import { editCommand, group, parse, Refusal, requireTask, UsageError } from "./edit.js";

const usage = `Usage: task-tree component <subcommand>

Subcommands:
  add <id> --title <title>           Add a reusable component in components/<id>.json
  extract <task-id>                  Move a task's subtree into a component, included in its place
  remove <id>                        Remove a component
`;

const add = editCommand(usage, (workspace, args) => {
  const { values, positionals } = parse(args, ["id"], { title: { type: "string" } });
  const [id] = positionals as [string];
  if (values.title === undefined) {
    throw new UsageError("--title is required");
  }
  const file = `components/${id}.json`;
  if (workspace.exists(file)) {
    throw new Refusal(`component "${id}" already exists`);
  }
  workspace.write(file, { version: 1, component: { id, title: values.title } });
});

const extract = editCommand(usage, (workspace, args) => {
  const [id] = parse(args, ["task-id"], {}).positionals as [string];
  const located = requireTask(workspace, id);
  if (located.siblings === undefined) {
    throw new Refusal(`"${id}" is a file's root task; only a task inside one can be extracted`);
  }
  const file = `components/${id}.json`;
  if (workspace.exists(file)) {
    throw new Refusal(`component "${id}" already exists`);
  }
  located.siblings[located.siblings.indexOf(located.node)] = { include: id };
  workspace.touch(located.file);
  workspace.write(file, { version: 1, component: located.node });
});

const remove = editCommand(usage, (workspace, args) => {
  const [id] = parse(args, ["id"], {}).positionals as [string];
  const file = `components/${id}.json`;
  if (!workspace.exists(file)) {
    throw new Refusal(`component not found: ${id}`);
  }
  workspace.remove(file);
});

export const component: Command = group(usage, { add, extract, remove });
