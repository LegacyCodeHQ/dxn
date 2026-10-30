import type { Workspace } from "../workspace.js";
import type { Command } from "./context.js";
import {
  editCommand,
  group,
  isObject,
  type Located,
  nodeNodes,
  nodeOrder,
  ordered,
  overrideTargets,
  pairs,
  parse,
  Refusal,
  renameKey,
  reorder,
  requireNode,
  setValues,
  UsageError,
  unsetValues,
} from "./edit.js";

const usage = `Usage: task-tree node <subcommand>

Subcommands:
  add <id> --title <title> [--parent <id>] [--type <type>]
                                     Add a node; without --parent, a root in roots/<id>.json
  set-title <id> <title>             Change a node's title
  set-type <id> <type> | --none      Change or clear a node's type
  move <id> --parent <id>            Move a node and its subtree under another node
  rename <id> <new-id>               Rename a node and every reference to it
  remove <id>                        Remove a node and its subtree
  only-when <id> <ancestor-id> (<state>... | --always)
                                     Make a node exist only in some states of a shared ancestor
  transition add <node-id> <id> --from <state> --to <state> --on click|keydown|pointerdown|resize
                 [--key <key>] [--target <node>] [--outside <node>] [--when <dimension>=a,b] [--focus <node>]
                                     Add how a shared node's state changes
  transition remove <node-id> <id>   Remove a transition
  include <parent-id> <component-id> Include a component under a node
  include-states <parent-id> <component-id> <node-id> <group> (<value>... | --any)
                                     Fix a node's state group values through that include
  uninclude <parent-id> <component-id>
                                     Remove that include
  set <id> <attribute> <state>=<value>...
                                     Set the node's own custom attribute values
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
  const node: Record<string, unknown> = { id, title: values.title };
  if (values.type !== undefined) node.type = values.type;
  if (values.parent === undefined) {
    const file = `roots/${id}.json`;
    if (workspace.exists(file)) {
      throw new Refusal(`node "${id}" already exists`);
    }
    workspace.write(file, { version: 1, root: node });
    return;
  }
  const parent = requireNode(workspace, values.parent);
  parent.item.children = [
    ...(Array.isArray(parent.item.children) ? parent.item.children : []),
    node,
  ];
  reorder(parent.item, nodeOrder);
  workspace.touch(parent.file);
});

const setTitle = editCommand(usage, (workspace, args) => {
  const [id, title] = parse(args, ["id", "title"], {}).positionals as [string, string];
  const located = requireNode(workspace, id);
  located.item.title = title;
  workspace.touch(located.file);
});

const setType = editCommand(usage, (workspace, args) => {
  const { values, positionals } = parse(args, ["id"], { none: { type: "boolean" } }, true);
  const [id, type, ...extra] = positionals as [string, string | undefined];
  if ((type === undefined) === (values.none !== true) || extra.length > 0) {
    throw new UsageError("give a type or --none");
  }
  const located = requireNode(workspace, id);
  if (type === undefined) {
    delete located.item.type;
  } else {
    located.item.type = type;
    reorder(located.item, nodeOrder);
  }
  workspace.touch(located.file);
});

const move = editCommand(usage, (workspace, args) => {
  const { values, positionals } = parse(args, ["id"], { parent: { type: "string" } });
  const [id] = positionals as [string];
  if (values.parent === undefined) {
    throw new UsageError("--parent is required");
  }
  const moving = requireNode(workspace, id);
  const parent = requireNode(workspace, values.parent);
  if (contains(moving.item, values.parent)) {
    throw new Refusal(`cannot move "${id}" into its own subtree`);
  }
  detach(workspace, moving);
  parent.item.children = [
    ...(Array.isArray(parent.item.children) ? parent.item.children : []),
    moving.item,
  ];
  reorder(parent.item, nodeOrder);
  workspace.touch(parent.file);
});

const rename = editCommand(usage, (workspace, args) => {
  const [id, next] = parse(args, ["id", "new-id"], {}).positionals as [string, string];
  const located = requireNode(workspace, id);
  located.item.id = next;
  workspace.touch(located.file);
  if (located.siblings === undefined) {
    // A root or component file is named after its id.
    const folder = located.key === "root" ? "roots" : "components";
    workspace.move(located.file, `${folder}/${next}.json`);
    if (located.key === "root") {
      workspace.move(`verification/${id}.json`, `verification/${next}.json`);
    } else {
      for (const [file, item] of nodeNodes(workspace)) {
        renameIncludes(workspace, file, item, id, next);
      }
    }
  }
  renameNodeReferences(workspace, id, next);
});

const remove = editCommand(usage, (workspace, args) => {
  const [id] = parse(args, ["id"], {}).positionals as [string];
  detach(workspace, requireNode(workspace, id));
});

const set = editCommand(usage, (workspace, args) => {
  const [id, attribute, ...rest] = parse(args, ["id", "attribute"], {}, true).positionals as [
    string,
    string,
    ...string[],
  ];
  const located = requireNode(workspace, id);
  setValues(located.item, attribute, pairs(rest));
  reorder(located.item, nodeOrder);
  workspace.touch(located.file);
});

const unset = editCommand(usage, (workspace, args) => {
  const [id, attribute, ...states] = parse(args, ["id", "attribute"], {}, true).positionals as [
    string,
    string,
    ...string[],
  ];
  const located = requireNode(workspace, id);
  unsetValues(located.item, attribute, states);
  workspace.touch(located.file);
});

const include = editCommand(usage, (workspace, args) => {
  const [parentId, component] = parse(args, ["parent-id", "component-id"], {}).positionals as [
    string,
    string,
  ];
  const parent = requireNode(workspace, parentId);
  parent.item.children = [
    ...(Array.isArray(parent.item.children) ? parent.item.children : []),
    { include: component },
  ];
  reorder(parent.item, nodeOrder);
  workspace.touch(parent.file);
});

const uninclude = editCommand(usage, (workspace, args) => {
  const [parentId, component] = parse(args, ["parent-id", "component-id"], {}).positionals as [
    string,
    string,
  ];
  const parent = requireNode(workspace, parentId);
  const children = Array.isArray(parent.item.children) ? parent.item.children : [];
  const index = children.findIndex((child) => isObject(child) && child.include === component);
  if (index < 0) {
    throw new Refusal(`"${parentId}" does not include "${component}"`);
  }
  children.splice(index, 1);
  workspace.touch(parent.file);
});

const onlyWhen = editCommand(usage, (workspace, args) => {
  const { values, positionals } = parse(
    args,
    ["id", "ancestor-id"],
    { always: { type: "boolean" } },
    true,
  );
  const [id, ancestor, ...states] = positionals as [string, string, ...string[]];
  if ((states.length === 0) === (values.always !== true)) {
    throw new UsageError("give the states the node exists in, or --always");
  }
  const located = requireNode(workspace, id);
  const conditions = isObject(located.item.onlyWhen) ? located.item.onlyWhen : {};
  if (values.always === true) {
    delete conditions[ancestor];
  } else {
    conditions[ancestor] = states;
  }
  if (Object.keys(conditions).length === 0) {
    delete located.item.onlyWhen;
  } else {
    located.item.onlyWhen = conditions;
    reorder(located.item, nodeOrder);
  }
  workspace.touch(located.file);
});

const includeStates = editCommand(usage, (workspace, args) => {
  const { values, positionals } = parse(
    args,
    ["parent-id", "component-id", "node-id", "group"],
    { any: { type: "boolean" } },
    true,
  );
  const [parentId, component, id, stateGroup, ...listed] = positionals as [
    string,
    string,
    string,
    string,
    ...string[],
  ];
  if ((listed.length === 0) === (values.any !== true)) {
    throw new UsageError("give the values the node has through this include, or --any");
  }
  const parent = requireNode(workspace, parentId);
  const children = Array.isArray(parent.item.children) ? parent.item.children : [];
  const include = children.find((child) => isObject(child) && child.include === component);
  if (!isObject(include)) {
    throw new Refusal(`"${parentId}" does not include "${component}"`);
  }
  const states = isObject(include.states) ? include.states : {};
  const byGroup = isObject(states[id]) ? (states[id] as Record<string, unknown>) : {};
  if (values.any === true) {
    delete byGroup[stateGroup];
  } else {
    byGroup[stateGroup] = listed;
  }
  if (Object.keys(byGroup).length === 0) delete states[id];
  else states[id] = byGroup;
  if (Object.keys(states).length === 0) delete include.states;
  else include.states = states;
  workspace.touch(parent.file);
});

const transitionOrder = ["id", "from", "to", "on", "key", "target", "outside", "when", "focus"];

const addTransition = editCommand(usage, (workspace, args) => {
  const { values, positionals } = parse(args, ["node-id", "id"], {
    from: { type: "string" },
    to: { type: "string" },
    on: { type: "string" },
    key: { type: "string" },
    target: { type: "string" },
    outside: { type: "string" },
    when: { type: "string", multiple: true },
    focus: { type: "string" },
  });
  const [nodeId, id] = positionals as [string, string];
  if (values.from === undefined || values.to === undefined || values.on === undefined) {
    throw new UsageError("--from, --to and --on are required");
  }
  const when: Record<string, string[]> = {};
  for (const entry of values.when ?? []) {
    const at = entry.indexOf("=");
    if (at <= 0 || at === entry.length - 1) {
      throw new UsageError(`expected --when <dimension>=a,b, got ${JSON.stringify(entry)}`);
    }
    when[entry.slice(0, at)] = entry.slice(at + 1).split(",");
  }
  const located = requireNode(workspace, nodeId);
  const list = Array.isArray(located.item.transitions) ? located.item.transitions : [];
  if (list.some((transition) => isObject(transition) && transition.id === id)) {
    throw new Refusal(`node "${nodeId}" already has a transition "${id}"`);
  }
  const transition: Record<string, unknown> = {
    id,
    from: values.from,
    to: values.to,
    on: values.on,
    key: values.key,
    target: values.target,
    outside: values.outside,
    ...(Object.keys(when).length === 0 ? {} : { when }),
    focus: values.focus,
  };
  for (const key of Object.keys(transition)) {
    if (transition[key] === undefined) delete transition[key];
  }
  located.item.transitions = [...list, ordered(transition, transitionOrder)];
  reorder(located.item, nodeOrder);
  workspace.touch(located.file);
});

const removeTransition = editCommand(usage, (workspace, args) => {
  const [nodeId, id] = parse(args, ["node-id", "id"], {}).positionals as [string, string];
  const located = requireNode(workspace, nodeId);
  const list = Array.isArray(located.item.transitions) ? located.item.transitions : [];
  const index = list.findIndex((transition) => isObject(transition) && transition.id === id);
  if (index < 0) {
    throw new Refusal(`node "${nodeId}" has no transition "${id}"`);
  }
  list.splice(index, 1);
  if (list.length === 0) delete located.item.transitions;
  workspace.touch(located.file);
});

export const node: Command = group(usage, {
  transition: group(usage, { add: addTransition, remove: removeTransition }),
  "include-states": includeStates,
  "only-when": onlyWhen,
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

// Takes a node out of its file: from its parent's children, or the whole
// file when it is the root.
function detach(workspace: Workspace, located: Located): void {
  if (located.siblings === undefined) {
    workspace.remove(located.file);
    return;
  }
  located.siblings.splice(located.siblings.indexOf(located.item), 1);
  workspace.touch(located.file);
}

function contains(item: Record<string, unknown>, id: string): boolean {
  if (item.id === id) return true;
  return (
    Array.isArray(item.children) &&
    item.children.some((child) => isObject(child) && contains(child, id))
  );
}

function renameIncludes(
  workspace: Workspace,
  file: string,
  item: Record<string, unknown>,
  from: string,
  to: string,
): void {
  if (!Array.isArray(item.children)) return;
  for (const child of item.children) {
    if (isObject(child) && child.include === from) {
      child.include = to;
      workspace.touch(file);
    }
  }
}

// appliesTo, only, override node keys and verification records.
function renameNodeReferences(workspace: Workspace, from: string, to: string): void {
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
      if (kind === "nodes" && from in targets) {
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
      if (isObject(record) && record.node === from) {
        record.node = to;
        workspace.touch(file);
      }
    }
  }
}
