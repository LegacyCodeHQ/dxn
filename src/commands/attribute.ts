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
import { attributeList } from "./reading.js";

const usage = `Usage: dimensions attribute <subcommand>

Subcommands:
  list                               List every custom attribute and its values
  add <name> --values a,b            Declare a custom attribute and its values
  add-value <name> <value>           Add a value to an attribute
  remove-value <name> <value>        Remove a value from an attribute
  remove <name>                      Remove an attribute
`;

function attributes(workspace: Workspace): Json {
  const types = typesFile(workspace);
  if (!isObject(types.customAttributes)) {
    types.customAttributes = {};
    reorder(types, typesOrder);
  }
  return types.customAttributes as Json;
}

function requireAttribute(workspace: Workspace, name: string): Json {
  const attribute = attributes(workspace)[name];
  if (!isObject(attribute)) {
    throw new Refusal(`attribute not found: ${name}`);
  }
  return attribute;
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
  const all = attributes(workspace);
  if (name in all) {
    throw new Refusal(`attribute "${name}" already exists`);
  }
  all[name] = { values: declared };
});

const addValue = edit((workspace, args) => {
  const [name, value] = parse(args, ["name", "value"], {}).positionals as [string, string];
  const attribute = requireAttribute(workspace, name);
  attribute.values = [...(Array.isArray(attribute.values) ? attribute.values : []), value];
});

const removeValue = edit((workspace, args) => {
  const [name, value] = parse(args, ["name", "value"], {}).positionals as [string, string];
  const attribute = requireAttribute(workspace, name);
  if (Array.isArray(attribute.values)) {
    attribute.values = attribute.values.filter((existing) => existing !== value);
  }
});

const remove = edit((workspace, args) => {
  const [name] = parse(args, ["name"], {}).positionals as [string];
  requireAttribute(workspace, name);
  delete attributes(workspace)[name];
});

export const attribute: Command = group(usage, {
  list: attributeList,
  add,
  "add-value": addValue,
  "remove-value": removeValue,
  remove,
});
