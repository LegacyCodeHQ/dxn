import type { Json, Workspace } from "../workspace.js";
import type { Command } from "./context.js";
import {
  editCommand,
  group,
  isObject,
  list,
  overrideTargets,
  parse,
  Refusal,
  renameKey,
  reorder,
  taskNodes,
  typesFile,
  typesOrder,
  UsageError,
} from "./edit.js";

const usage = `Usage: task-tree state-group <subcommand>

A state group is a named set of states that exclude each other, such as hover
(rest, hovered) or selection (unselected, selected). A type can use several
groups, which vary independently. Types use groups with "type add --groups" or
"type use-group".

Subcommands:
  add <name> --values a,b            Declare a state group
  add-value <name> <value>           Add a value
  remove-value <name> <value>        Remove a value
  rename-value <name> <old> <new>    Rename a value everywhere the group's types use it
  remove <name>                      Remove a state group
`;

function groups(workspace: Workspace): Json {
  const types = typesFile(workspace);
  if (!isObject(types.stateGroups)) {
    types.stateGroups = {};
    reorder(types, typesOrder);
  }
  return types.stateGroups as Json;
}

function requireGroup(workspace: Workspace, name: string): string[] {
  const values = groups(workspace)[name];
  if (!Array.isArray(values)) {
    throw new Refusal(`state group not found: ${name}`);
  }
  return values as string[];
}

function edit(run: (workspace: Workspace, args: string[]) => void): Command {
  return editCommand(usage, (workspace, args) => {
    run(workspace, args);
    workspace.touch("types.json");
  });
}

const add = edit((workspace, args) => {
  const { values, positionals } = parse(args, ["name"], { values: { type: "string" } });
  const [name] = positionals as [string];
  const declared = list(values.values);
  if (declared === undefined) {
    throw new UsageError("--values is required");
  }
  const all = groups(workspace);
  if (name in all) {
    throw new Refusal(`state group "${name}" already exists`);
  }
  all[name] = declared;
});

const addValue = edit((workspace, args) => {
  const [name, value] = parse(args, ["name", "value"], {}).positionals as [string, string];
  groups(workspace)[name] = [...requireGroup(workspace, name), value];
});

const removeValue = edit((workspace, args) => {
  const [name, value] = parse(args, ["name", "value"], {}).positionals as [string, string];
  groups(workspace)[name] = requireGroup(workspace, name).filter((existing) => existing !== value);
});

const remove = edit((workspace, args) => {
  const [name] = parse(args, ["name"], {}).positionals as [string];
  requireGroup(workspace, name);
  delete groups(workspace)[name];
});

// Renames a value in the group and wherever a type using the group refers to
// it: the type's subset and values, its tasks' values and onlyWhen lists,
// overrides of the type and its tasks, and verification contexts.
const renameValue = edit((workspace, args) => {
  const [name, from, to] = parse(args, ["name", "old", "new"], {}).positionals as [
    string,
    string,
    string,
  ];
  const values = requireGroup(workspace, name);
  if (!values.includes(from)) {
    throw new Refusal(`state group "${name}" has no value "${from}"`);
  }
  groups(workspace)[name] = values.map((value) => (value === from ? to : value));
  const swap = (list: unknown) =>
    Array.isArray(list) ? list.map((value) => (value === from ? to : value)) : list;
  const renameStates = (owner: Json | undefined) => {
    const attributes = owner?.customAttributes;
    if (!isObject(attributes)) return;
    for (const byState of Object.values(attributes)) {
      if (isObject(byState)) renameKey(byState, from, to);
    }
  };

  const types = typesFile(workspace).types;
  const using = new Set<string>();
  for (const [typeName, type] of Object.entries(isObject(types) ? types : {})) {
    if (!isObject(type)) continue;
    const used = type.stateGroups;
    if (Array.isArray(used) ? used.includes(name) : isObject(used) && name in used) {
      using.add(typeName);
      if (isObject(used)) used[name] = swap(used[name]);
      renameStates(type);
    }
  }

  const tasksUsing = new Set<string>();
  for (const [file, node] of taskNodes(workspace)) {
    if (typeof node.type === "string" && using.has(node.type)) {
      tasksUsing.add(node.id as string);
      renameStates(node);
      workspace.touch(file);
    }
  }
  for (const [file, node] of taskNodes(workspace)) {
    const conditions = node.onlyWhen;
    if (!isObject(conditions)) continue;
    for (const [ancestor, states] of Object.entries(conditions)) {
      if (tasksUsing.has(ancestor)) {
        conditions[ancestor] = swap(states);
        workspace.touch(file);
      }
    }
  }

  for (const file of workspace.list("overrides")) {
    const overrides = workspace.read(file);
    overrideTargets(overrides?.overrides, (kind, targets) => {
      for (const [target, override] of Object.entries(targets)) {
        const affected = kind === "types" ? using.has(target) : tasksUsing.has(target);
        if (!affected || !isObject(override)) continue;
        if (isObject(override.states)) {
          override.states.add = swap(override.states.add);
          override.states.remove = swap(override.states.remove);
          for (const key of ["add", "remove"]) {
            if (override.states[key] === undefined) delete override.states[key];
          }
        }
        renameStates(override);
        workspace.touch(file);
      }
    });
  }

  for (const file of workspace.list("verification")) {
    const verification = workspace.read(file);
    if (!Array.isArray(verification?.records)) continue;
    for (const record of verification.records) {
      if (
        isObject(record) &&
        tasksUsing.has(record.task as string) &&
        isObject(record.context) &&
        record.context[name] === from
      ) {
        record.context[name] = to;
        workspace.touch(file);
      }
    }
  }
});

export const stateGroup: Command = group(usage, {
  "rename-value": renameValue,
  add,
  "add-value": addValue,
  "remove-value": removeValue,
  remove,
});
