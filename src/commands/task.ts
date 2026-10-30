import type { Workspace } from "../workspace.js";
import type { Command } from "./context.js";
import {
  editCommand,
  group,
  isObject,
  type Located,
  overrideTargets,
  pairs,
  parse,
  Refusal,
  renameKey,
  reorder,
  requireTask,
  setValues,
  taskNodes,
  taskOrder,
  UsageError,
  unsetValues,
} from "./edit.js";

const usage = `Usage: task-tree task <subcommand>

Subcommands:
  add <id> --title <title> [--parent <id>] [--type <type>]
                                     Add a task; without --parent, a page in tasks/<id>.json
  set-title <id> <title>             Change a task's title
  set-type <id> <type> | --none      Change or clear a task's type
  move <id> --parent <id>            Move a task and its subtree under another task
  rename <id> <new-id>               Rename a task and every reference to it
  remove <id>                        Remove a task and its subtree
  include <parent-id> <component-id> Include a component under a task
  uninclude <parent-id> <component-id>
                                     Remove that include
  set <id> <attribute> <state>=<value>...
                                     Set the task's own custom attribute values
  unset <id> <attribute> [<state>...]
                                     Clear some or all of those values
`;

const add = editCommand(usage, (workspace, args) => {
  const { values, positionals } = parse(args, ["id"], {
    title: { type: "string" },
    parent: { type: "string" },
    type: { type: "string" },
  });
  const [id] = positionals as [string];
  if (values.title === undefined) {
    throw new UsageError("--title is required");
  }
  const task: Record<string, unknown> = { id, title: values.title };
  if (values.type !== undefined) task.type = values.type;
  if (values.parent === undefined) {
    const file = `tasks/${id}.json`;
    if (workspace.exists(file)) {
      throw new Refusal(`task "${id}" already exists`);
    }
    workspace.write(file, { version: 1, task });
    return;
  }
  const parent = requireTask(workspace, values.parent);
  parent.node.children = [
    ...(Array.isArray(parent.node.children) ? parent.node.children : []),
    task,
  ];
  reorder(parent.node, taskOrder);
  workspace.touch(parent.file);
});

const setTitle = editCommand(usage, (workspace, args) => {
  const [id, title] = parse(args, ["id", "title"], {}).positionals as [string, string];
  const located = requireTask(workspace, id);
  located.node.title = title;
  workspace.touch(located.file);
});

const setType = editCommand(usage, (workspace, args) => {
  const { values, positionals } = parse(args, ["id"], { none: { type: "boolean" } }, true);
  const [id, type, ...extra] = positionals as [string, string | undefined];
  if ((type === undefined) === (values.none !== true) || extra.length > 0) {
    throw new UsageError("give a type or --none");
  }
  const located = requireTask(workspace, id);
  if (type === undefined) {
    delete located.node.type;
  } else {
    located.node.type = type;
    reorder(located.node, taskOrder);
  }
  workspace.touch(located.file);
});

const move = editCommand(usage, (workspace, args) => {
  const { values, positionals } = parse(args, ["id"], { parent: { type: "string" } });
  const [id] = positionals as [string];
  if (values.parent === undefined) {
    throw new UsageError("--parent is required");
  }
  const moving = requireTask(workspace, id);
  const parent = requireTask(workspace, values.parent);
  if (contains(moving.node, values.parent)) {
    throw new Refusal(`cannot move "${id}" into its own subtree`);
  }
  detach(workspace, moving);
  parent.node.children = [
    ...(Array.isArray(parent.node.children) ? parent.node.children : []),
    moving.node,
  ];
  reorder(parent.node, taskOrder);
  workspace.touch(parent.file);
});

const rename = editCommand(usage, (workspace, args) => {
  const [id, next] = parse(args, ["id", "new-id"], {}).positionals as [string, string];
  const located = requireTask(workspace, id);
  located.node.id = next;
  workspace.touch(located.file);
  if (located.siblings === undefined) {
    // A page or component is named after its root task.
    const folder = located.key === "task" ? "tasks" : "components";
    workspace.move(located.file, `${folder}/${next}.json`);
    if (located.key === "task") {
      workspace.move(`verification/${id}.json`, `verification/${next}.json`);
    } else {
      for (const [file, node] of taskNodes(workspace)) {
        renameIncludes(workspace, file, node, id, next);
      }
    }
  }
  renameTaskReferences(workspace, id, next);
});

const remove = editCommand(usage, (workspace, args) => {
  const [id] = parse(args, ["id"], {}).positionals as [string];
  detach(workspace, requireTask(workspace, id));
});

const set = editCommand(usage, (workspace, args) => {
  const [id, attribute, ...rest] = parse(args, ["id", "attribute"], {}, true).positionals as [
    string,
    string,
    ...string[],
  ];
  const located = requireTask(workspace, id);
  setValues(located.node, attribute, pairs(rest));
  reorder(located.node, taskOrder);
  workspace.touch(located.file);
});

const unset = editCommand(usage, (workspace, args) => {
  const [id, attribute, ...states] = parse(args, ["id", "attribute"], {}, true).positionals as [
    string,
    string,
    ...string[],
  ];
  const located = requireTask(workspace, id);
  unsetValues(located.node, attribute, states);
  workspace.touch(located.file);
});

const include = editCommand(usage, (workspace, args) => {
  const [parentId, component] = parse(args, ["parent-id", "component-id"], {}).positionals as [
    string,
    string,
  ];
  const parent = requireTask(workspace, parentId);
  parent.node.children = [
    ...(Array.isArray(parent.node.children) ? parent.node.children : []),
    { include: component },
  ];
  reorder(parent.node, taskOrder);
  workspace.touch(parent.file);
});

const uninclude = editCommand(usage, (workspace, args) => {
  const [parentId, component] = parse(args, ["parent-id", "component-id"], {}).positionals as [
    string,
    string,
  ];
  const parent = requireTask(workspace, parentId);
  const children = Array.isArray(parent.node.children) ? parent.node.children : [];
  const index = children.findIndex((child) => isObject(child) && child.include === component);
  if (index < 0) {
    throw new Refusal(`"${parentId}" does not include "${component}"`);
  }
  children.splice(index, 1);
  workspace.touch(parent.file);
});

export const task: Command = group(usage, {
  include,
  uninclude,
  add,
  "set-title": setTitle,
  "set-type": setType,
  move,
  rename,
  remove,
  set,
  unset,
});

// Takes a task out of its file: from its parent's children, or the whole
// file when it is the root task.
function detach(workspace: Workspace, located: Located): void {
  if (located.siblings === undefined) {
    workspace.remove(located.file);
    return;
  }
  located.siblings.splice(located.siblings.indexOf(located.node), 1);
  workspace.touch(located.file);
}

function contains(node: Record<string, unknown>, id: string): boolean {
  if (node.id === id) return true;
  return (
    Array.isArray(node.children) &&
    node.children.some((child) => isObject(child) && contains(child, id))
  );
}

function renameIncludes(
  workspace: Workspace,
  file: string,
  node: Record<string, unknown>,
  from: string,
  to: string,
): void {
  if (!Array.isArray(node.children)) return;
  for (const child of node.children) {
    if (isObject(child) && child.include === from) {
      child.include = to;
      workspace.touch(file);
    }
  }
}

// appliesTo, only, override task keys and verification records.
function renameTaskReferences(workspace: Workspace, from: string, to: string): void {
  for (const file of workspace.list("dimensions")) {
    const dimension = workspace.read(file);
    if (Array.isArray(dimension?.appliesTo) && dimension.appliesTo.includes(from)) {
      dimension.appliesTo = dimension.appliesTo.map((id) => (id === from ? to : id));
      workspace.touch(file);
    }
  }
  for (const file of workspace.list("overrides")) {
    const overrides = workspace.read(file);
    if (overrides === undefined) continue;
    let changed = false;
    if (isObject(overrides.only) && from in overrides.only) {
      renameKey(overrides.only, from, to);
      changed = true;
    }
    overrideTargets(overrides.overrides, (kind, targets) => {
      if (kind === "tasks" && from in targets) {
        renameKey(targets, from, to);
        changed = true;
      }
    });
    if (changed) workspace.touch(file);
  }
  for (const file of workspace.list("verification")) {
    const verification = workspace.read(file);
    if (!Array.isArray(verification?.records)) continue;
    for (const record of verification.records) {
      if (isObject(record) && record.task === from) {
        record.task = to;
        workspace.touch(file);
      }
    }
  }
}
