import type { Json, Workspace } from "../workspace.js";
import type { Command } from "./context.js";
import {
  editCommand,
  editExpectations,
  editRecords,
  expectationValues,
  group,
  isObject,
  list,
  overrideTargets,
  parse,
  Refusal,
  renameKey,
  reorder,
  swapValues,
  treeNodes,
  typesFile,
  typesOrder,
  UsageError,
} from "./edit.js";
import { stateGroupList } from "./reading.js";

const usage = `Usage: dimensions state-group <subcommand>

A state group is a named set of states that exclude each other, such as hover
(rest, hovered) or selection (unselected, selected). A type can use several
groups, which vary independently. Types use groups with "type add --groups" or
"type use-group".

Subcommands:
  list                               List every state group, its values and the types using it
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
// it: the type's subset and values, its nodes' values and onlyWhen lists,
// overrides of the type and its nodes, and verification contexts.
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
    const attributes = owner?.attributes;
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

  const nodesUsing = new Set<string>();
  const nodeType = new Map<string, string>();
  for (const [file, item] of treeNodes(workspace)) {
    if (typeof item.type === "string" && using.has(item.type)) {
      nodesUsing.add(item.id as string);
      nodeType.set(item.id as string, item.type);
      renameStates(item);
      workspace.touch(file);
    }
  }
  for (const [file, item] of treeNodes(workspace)) {
    const conditions = item.onlyWhen;
    if (!isObject(conditions)) continue;
    for (const [ancestor, states] of Object.entries(conditions)) {
      if (nodesUsing.has(ancestor)) {
        conditions[ancestor] = swap(states);
        workspace.touch(file);
      }
    }
  }

  for (const file of workspace.list("overrides")) {
    const overrides = workspace.read(file);
    overrideTargets(overrides?.overrides, (kind, targets) => {
      for (const [target, override] of Object.entries(targets)) {
        const affected = kind === "types" ? using.has(target) : nodesUsing.has(target);
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

  // A shared node using the group is named by its id in contexts, and its
  // transitions move between the group's values.
  const sharedUsing = new Set(
    [...nodesUsing].filter((id) => {
      const type = isObject(types) ? types[nodeType.get(id) as string] : undefined;
      return isObject(type) && type.shared === true;
    }),
  );
  // The context keys that hold this group's values.
  const keysFor = (node: unknown) =>
    nodesUsing.has(node as string) ? [name, ...sharedUsing] : [...sharedUsing];
  const swapIn = (context: unknown, keys: string[]) => swapValues(context, keys, from, to);
  for (const [file, item] of treeNodes(workspace)) {
    let changed = false;
    if (sharedUsing.has(item.id as string) && Array.isArray(item.transitions)) {
      for (const transition of item.transitions) {
        if (!isObject(transition)) continue;
        for (const key of ["from", "to"]) {
          if (transition[key] === from) {
            transition[key] = to;
            changed = true;
          }
        }
      }
    }
    if (isObject(item.states)) {
      // An include's states: node id -> group -> values.
      for (const [node, byGroup] of Object.entries(item.states)) {
        if (nodesUsing.has(node) && isObject(byGroup) && Array.isArray(byGroup[name])) {
          byGroup[name] = swap(byGroup[name]);
          changed = true;
        }
      }
    }
    if (changed) workspace.touch(file);
  }
  editRecords(workspace, (record) => swapIn(record.context, keysFor(record.node)));
  // A shared node's overrides file is keyed by its states.
  for (const id of sharedUsing) {
    const file = `overrides/${id}.json`;
    const overrides = workspace.read(file)?.overrides;
    if (isObject(overrides) && from in overrides) {
      renameKey(overrides, from, to);
      workspace.touch(file);
    }
  }
  editExpectations(workspace, (expectation) =>
    expectationValues(expectation)
      .map((values) => swapIn(values, [name, ...sharedUsing]))
      .includes(true),
  );
});

export const stateGroup: Command = group(usage, {
  list: stateGroupList,
  "rename-value": renameValue,
  add,
  "add-value": addValue,
  "remove-value": removeValue,
  remove,
});
