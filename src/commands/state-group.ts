import type { Json, Workspace } from "../workspace.js";
import type { Command } from "./context.js";
import {
  editCommand,
  group,
  isObject,
  list,
  parse,
  Refusal,
  reorder,
  typesFile,
  typesOrder,
  UsageError,
} from "./edit.js";

const usage = `Usage: task-tree state-group <subcommand>

A state group is a named set of independent states, such as interaction
(normal, hovered, focused) or selection (unselected, selected). Types use
groups with "type add --groups" or "type use-group".

Subcommands:
  add <name> --values a,b            Declare a state group
  add-value <name> <value>           Add a value
  remove-value <name> <value>        Remove a value
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

export const stateGroup: Command = group(usage, {
  add,
  "add-value": addValue,
  "remove-value": removeValue,
  remove,
});
