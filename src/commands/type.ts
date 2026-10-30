import type { Json, Workspace } from "../workspace.js";
import type { Command } from "./context.js";
import {
  editCommand,
  group,
  isObject,
  list,
  overrideTargets,
  pairs,
  parse,
  Refusal,
  renameKey,
  reorder,
  setValues,
  taskNodes,
  typeOrder,
  typesFile,
  typesOrder,
  unsetValues,
} from "./edit.js";

const usage = `Usage: task-tree type <subcommand>

Subcommands:
  add <name> [--states a,b,c]        Add a type
  add-state <type> <state>           Add a state to a type
  remove-state <type> <state>        Remove a state from a type
  set <type> <attribute> <state>=<value>...
                                     Set the type's custom attribute values
  unset <type> <attribute> [<state>...]
                                     Clear some or all of those values
  require <type> <check>             Make every instance of the type need a check
  unrequire <type> <check>           Stop requiring a check
  rename <name> <new-name>           Rename a type and every use of it
  remove <name>                      Remove a type
`;

// types.json's types map, created on first use.
function typeMap(workspace: Workspace): Json {
  const types = typesFile(workspace);
  if (!isObject(types.types)) {
    types.types = {};
    reorder(types, typesOrder);
  }
  return types.types as Json;
}

function requireType(workspace: Workspace, name: string): Json {
  const type = typeMap(workspace)[name];
  if (!isObject(type)) {
    throw new Refusal(`type not found: ${name}`);
  }
  return type;
}

function edit(run: (workspace: Workspace, args: string[]) => void): Command {
  return editCommand(usage, (workspace, args) => {
    run(workspace, args);
    workspace.touch("types.json");
  });
}

const add = edit((workspace, args) => {
  const { values, positionals } = parse(args, ["name"], { states: { type: "string" } });
  const [name] = positionals as [string];
  const types = typeMap(workspace);
  if (name in types) {
    throw new Refusal(`type "${name}" already exists`);
  }
  const states = list(values.states);
  types[name] = states === undefined ? {} : { states };
});

const addState = edit((workspace, args) => {
  const [name, state] = parse(args, ["type", "state"], {}).positionals as [string, string];
  const type = requireType(workspace, name);
  type.states = [...(Array.isArray(type.states) ? type.states : []), state];
  reorder(type, typeOrder);
});

const removeState = edit((workspace, args) => {
  const [name, state] = parse(args, ["type", "state"], {}).positionals as [string, string];
  const type = requireType(workspace, name);
  if (Array.isArray(type.states)) {
    type.states = type.states.filter((existing) => existing !== state);
  }
});

const set = edit((workspace, args) => {
  const [name, attribute, ...rest] = parse(args, ["type", "attribute"], {}, true).positionals as [
    string,
    string,
    ...string[],
  ];
  const type = requireType(workspace, name);
  setValues(type, attribute, pairs(rest));
  reorder(type, typeOrder);
});

const unset = edit((workspace, args) => {
  const [name, attribute, ...states] = parse(args, ["type", "attribute"], {}, true).positionals as [
    string,
    string,
    ...string[],
  ];
  unsetValues(requireType(workspace, name), attribute, states);
});

const rename = edit((workspace, args) => {
  const [name, next] = parse(args, ["name", "new-name"], {}).positionals as [string, string];
  requireType(workspace, name);
  renameKey(typeMap(workspace), name, next);
  for (const [file, node] of taskNodes(workspace)) {
    if (node.type === name) {
      node.type = next;
      workspace.touch(file);
    }
  }
  for (const file of workspace.list("overrides")) {
    const overrides = workspace.read(file);
    overrideTargets(overrides?.overrides, (kind, targets) => {
      if (kind === "types" && name in targets) {
        renameKey(targets, name, next);
        workspace.touch(file);
      }
    });
  }
});

const remove = edit((workspace, args) => {
  const [name] = parse(args, ["name"], {}).positionals as [string];
  requireType(workspace, name);
  delete typeMap(workspace)[name];
});

const requireCheck = edit((workspace, args) => {
  const [name, check] = parse(args, ["type", "check"], {}).positionals as [string, string];
  const type = requireType(workspace, name);
  type.checks = [...(Array.isArray(type.checks) ? type.checks : []), check];
  reorder(type, typeOrder);
});

const unrequireCheck = edit((workspace, args) => {
  const [name, check] = parse(args, ["type", "check"], {}).positionals as [string, string];
  const type = requireType(workspace, name);
  if (!Array.isArray(type.checks) || !type.checks.includes(check)) {
    throw new Refusal(`type "${name}" does not require "${check}"`);
  }
  type.checks = type.checks.filter((existing) => existing !== check);
});

export const type: Command = group(usage, {
  require: requireCheck,
  unrequire: unrequireCheck,
  add,
  "add-state": addState,
  "remove-state": removeState,
  set,
  unset,
  rename,
  remove,
});
