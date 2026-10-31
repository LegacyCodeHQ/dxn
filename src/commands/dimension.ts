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
  parse,
  Refusal,
  renameKey,
  reorder,
  swapValues,
  treeNodes,
  UsageError,
} from "./edit.js";
import { dimensions } from "./reading.js";

const usage = `Usage: dxn dimension <subcommand>

Subcommands:
  list                               List every dimension, its values, default and scope
  add <name> --values a,b [--applies-to <id>[,<id>]] [--default <value>]
                                     Add a dimension in dimensions/<name>.json; without
                                     --applies-to it applies to nothing until applied
  add-value <name> <value>           Add a value
  remove-value <name> <value>        Remove a value
  rename-value <name> <old> <new>    Rename a value everywhere it is used
  set-default <name> <value> | --none
                                     Set or clear the default value
  apply <name> <node-id>             Apply the dimension to a node's subtree
  unapply <name> <node-id>           Stop applying it to that node
  remove <name>                      Remove the dimension
`;

const dimensionOrder = ["$schema", "version", "values", "default", "appliesTo"];

function requireDimension(workspace: Workspace, name: string): Json {
  const dimension = workspace.read(`dimensions/${name}.json`);
  if (dimension === undefined) {
    throw new Refusal(`dimension not found: ${name}`);
  }
  return dimension;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

// Edits dimensions/<name>.json; the first positional is the dimension name.
function edit(
  positionals: string[],
  options: Record<string, { type: "string" | "boolean" }>,
  run: (
    workspace: Workspace,
    dimension: Json,
    args: string[],
    values: Record<string, string | boolean | undefined>,
  ) => void,
): Command {
  return editCommand(usage, (workspace, args) => {
    const parsed = parse(args, ["name", ...positionals], options);
    const [name, ...rest] = parsed.positionals as [string, ...string[]];
    const dimension = requireDimension(workspace, name);
    run(workspace, dimension, rest, parsed.values);
    reorder(dimension, dimensionOrder);
    workspace.touch(`dimensions/${name}.json`);
  });
}

const add = editCommand(usage, (workspace, args) => {
  const { values, positionals } = parse(args, ["name"], {
    values: { type: "string" },
    "applies-to": { type: "string" },
    default: { type: "string" },
  });
  const [name] = positionals as [string];
  const declared = list(values.values);
  const appliesTo = list(values["applies-to"]);
  if (declared === undefined) {
    throw new UsageError("--values is required");
  }
  const file = `dimensions/${name}.json`;
  if (workspace.exists(file)) {
    throw new Refusal(`dimension "${name}" already exists`);
  }
  workspace.write(file, {
    version: 1,
    values: declared,
    ...(values.default === undefined ? {} : { default: values.default }),
    ...(appliesTo === undefined ? {} : { appliesTo }),
  });
});

const addValue = edit(["value"], {}, (_, dimension, [value]) => {
  dimension.values = [...strings(dimension.values), value as string];
});

const removeValue = edit(["value"], {}, (_, dimension, [value]) => {
  dimension.values = strings(dimension.values).filter((existing) => existing !== value);
});

const setDefaultCommand: Command = editCommand(usage, (workspace, args) => {
  const { values, positionals } = parse(args, ["name"], { none: { type: "boolean" } }, true);
  const [name, value, ...extra] = positionals as [string, string | undefined];
  if ((value === undefined) === (values.none !== true) || extra.length > 0) {
    throw new UsageError("give a value or --none");
  }
  const dimension = requireDimension(workspace, name);
  if (value === undefined) {
    delete dimension.default;
  } else {
    dimension.default = value;
    reorder(dimension, dimensionOrder);
  }
  workspace.touch(`dimensions/${name}.json`);
});

const apply = edit(["node-id"], {}, (_, dimension, [id]) => {
  dimension.appliesTo = [...strings(dimension.appliesTo), id as string];
});

const unapply = editCommand(usage, (workspace, args) => {
  const [name, id] = parse(args, ["name", "node-id"], {}).positionals as [string, string];
  const dimension = requireDimension(workspace, name);
  const appliesTo = strings(dimension.appliesTo);
  if (!appliesTo.includes(id)) {
    throw new Refusal(`dimension "${name}" does not apply to "${id}"`);
  }
  dimension.appliesTo = appliesTo.filter((existing) => existing !== id);
  // A dimension that applies to nothing leaves appliesTo out.
  if ((dimension.appliesTo as string[]).length === 0) delete dimension.appliesTo;
  workspace.touch(`dimensions/${name}.json`);
});

const renameValue = editCommand(usage, (workspace, args) => {
  const [name, from, to] = parse(args, ["name", "old", "new"], {}).positionals as [
    string,
    string,
    string,
  ];
  const dimension = requireDimension(workspace, name);
  const values = strings(dimension.values);
  if (!values.includes(from)) {
    throw new Refusal(`dimension "${name}" has no value "${from}"`);
  }
  dimension.values = values.map((value) => (value === from ? to : value));
  if (dimension.default === from) dimension.default = to;
  workspace.touch(`dimensions/${name}.json`);

  for (const file of workspace.list("overrides")) {
    const dimensions = file.slice("overrides/".length, -".json".length).split("+");
    const depth = dimensions.indexOf(name);
    const overrides = workspace.read(file);
    if (depth < 0 || overrides === undefined) continue;
    renameAtDepth(overrides.overrides, depth, from, to);
    if (dimensions.length === 1 && isObject(overrides.only)) {
      for (const [node, only] of Object.entries(overrides.only)) {
        overrides.only[node] = strings(only).map((value) => (value === from ? to : value));
      }
    }
    workspace.touch(file);
  }

  const swapIn = (context: unknown) => {
    if (!isObject(context) || context[name] !== from) return false;
    context[name] = to;
    return true;
  };
  editRecords(workspace, (record) => swapIn(record.context));
  const profiles = workspace.read("profiles.json")?.profiles;
  if (isObject(profiles)) {
    for (const values of Object.values(profiles)) {
      if (swapIn(values)) workspace.touch("profiles.json");
    }
  }
  const modifiers = workspace.read("profiles.json")?.modifiers;
  if (isObject(modifiers)) {
    for (const item of Object.values(modifiers)) {
      if (isObject(item) && swapIn(item.sets)) workspace.touch("profiles.json");
    }
  }
  editExpectations(workspace, (expectation) =>
    expectationValues(expectation)
      .map((values) => swapValues(values, [name], from, to))
      .includes(true),
  );
  for (const [file, item] of treeNodes(workspace)) {
    for (const transition of Array.isArray(item.transitions) ? item.transitions : []) {
      const values =
        isObject(transition) && isObject(transition.when) ? transition.when[name] : undefined;
      if (Array.isArray(values) && values.includes(from)) {
        (transition.when as Record<string, unknown>)[name] = values.map((value) =>
          value === from ? to : value,
        );
        workspace.touch(file);
      }
    }
  }
});

const remove = editCommand(usage, (workspace, args) => {
  const [name] = parse(args, ["name"], {}).positionals as [string];
  requireDimension(workspace, name);
  workspace.remove(`dimensions/${name}.json`);
});

export const dimension: Command = group(usage, {
  list: dimensions,
  add,
  "add-value": addValue,
  "remove-value": removeValue,
  "rename-value": renameValue,
  "set-default": setDefaultCommand,
  apply,
  unapply,
  remove,
});

// Renames a value key at one nesting level of an overrides map.
function renameAtDepth(item: unknown, depth: number, from: string, to: string): void {
  if (!isObject(item)) return;
  if (depth === 0) {
    renameKey(item, from, to);
    return;
  }
  for (const child of Object.values(item)) {
    renameAtDepth(child, depth - 1, from, to);
  }
}
