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
  treeNodes,
  typeOrder,
  typesFile,
  typesOrder,
  UsageError,
  unsetValues,
} from "./edit.js";
import { typeList } from "./reading.js";

const usage = `Usage: dxn type <subcommand>

Subcommands:
  list                               List every type, its states, checks and values
  add <name> [--states a,b,c | --groups g,h] [--shared]
                                     Add a type with plain states or state groups;
                                     --shared lets instances' subtrees vary with its state
  use-group <type> <group> [--values a,b]
                                     Use a state group, or only some of its values
  drop-group <type> <group>          Stop using a state group
  share <name> / unshare <name>      Make a type shared, or stop sharing it
  add-state <type> <state>           Add a state to a type
  remove-state <type> <state>        Remove a state from a type
  set <type> <attribute> <state>=<value>...
                                     Set the type's attribute values
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
  const { values, positionals } = parse(args, ["name"], {
    states: { type: "string" },
    groups: { type: "string" },
    shared: { type: "boolean" },
  });
  const [name] = positionals as [string];
  const types = typeMap(workspace);
  if (name in types) {
    throw new Refusal(`type "${name}" already exists`);
  }
  const states = list(values.states);
  const groups = list(values.groups);
  if (states !== undefined && groups !== undefined) {
    throw new UsageError("give --states or --groups, not both");
  }
  types[name] = {
    ...(states === undefined ? {} : { states }),
    ...(groups === undefined ? {} : { stateGroups: groups }),
    ...(values.shared === true ? { shared: true } : {}),
  };
});

// A type's stateGroups as group -> values (undefined: the whole group).
function usedGroups(type: Json): Map<string, string[] | undefined> {
  const used = type.stateGroups;
  if (Array.isArray(used)) {
    return new Map(used.map((group) => [group as string, undefined]));
  }
  if (isObject(used)) {
    return new Map(Object.entries(used).map(([group, values]) => [group, values as string[]]));
  }
  return new Map();
}

// Writes stateGroups back: a list when every group is used whole, otherwise
// group -> values, spelling out the whole groups from their declarations.
function setGroups(
  workspace: Workspace,
  type: Json,
  groups: Map<string, string[] | undefined>,
): void {
  if (groups.size === 0) {
    delete type.stateGroups;
  } else if ([...groups.values()].every((values) => values === undefined)) {
    type.stateGroups = [...groups.keys()];
  } else {
    const declared = typesFile(workspace).stateGroups;
    type.stateGroups = Object.fromEntries(
      [...groups].map(([group, values]) => [
        group,
        values ?? (isObject(declared) && Array.isArray(declared[group]) ? declared[group] : []),
      ]),
    );
  }
  reorder(type, typeOrder);
}

const useGroup = editCommand(usage, (workspace, args) => {
  const { values, positionals } = parse(args, ["type", "group"], { values: { type: "string" } });
  const [name, groupName] = positionals as [string, string];
  const type = requireType(workspace, name);
  const groups = usedGroups(type);
  groups.set(groupName, list(values.values));
  setGroups(workspace, type, groups);
  workspace.touch("types.json");
});

const dropGroup = editCommand(usage, (workspace, args) => {
  const [name, groupName] = parse(args, ["type", "group"], {}).positionals as [string, string];
  const type = requireType(workspace, name);
  const groups = usedGroups(type);
  if (!groups.has(groupName)) {
    throw new Refusal(`type "${name}" does not use state group "${groupName}"`);
  }
  groups.delete(groupName);
  setGroups(workspace, type, groups);
  workspace.touch("types.json");
});

function sharing(shared: boolean): Command {
  return edit((workspace, args) => {
    const [name] = parse(args, ["name"], {}).positionals as [string];
    const type = requireType(workspace, name);
    if (shared) {
      type.shared = true;
      reorder(type, typeOrder);
    } else {
      delete type.shared;
    }
  });
}

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
    const remaining = type.states.filter((existing) => existing !== state);
    // Without states the type can take state groups instead.
    if (remaining.length === 0) {
      delete type.states;
    } else {
      type.states = remaining;
    }
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
  for (const [file, item] of treeNodes(workspace)) {
    if (item.type === name) {
      item.type = next;
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
  list: typeList,
  "use-group": useGroup,
  "drop-group": dropGroup,
  share: sharing(true),
  unshare: sharing(false),
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
