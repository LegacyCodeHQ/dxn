import type { Json, Workspace } from "../workspace.js";
import type { Command } from "./context.js";
import {
  editCommand,
  group,
  isObject,
  parse,
  Refusal,
  reorder,
  typesFile,
  typesOrder,
} from "./edit.js";

const usage = `Usage: dimensions check <subcommand>

Subcommands:
  add <name>                         Declare a check, such as visual or behavior
  remove <name>                      Remove a check
`;

function checks(workspace: Workspace): Json {
  const types = typesFile(workspace);
  if (!isObject(types.customChecks)) {
    types.customChecks = {};
    reorder(types, typesOrder);
  }
  return types.customChecks as Json;
}

const add = editCommand(usage, (workspace, args) => {
  const [name] = parse(args, ["name"], {}).positionals as [string];
  const all = checks(workspace);
  if (name in all) {
    throw new Refusal(`check "${name}" already exists`);
  }
  all[name] = {};
  workspace.touch("types.json");
});

const remove = editCommand(usage, (workspace, args) => {
  const [name] = parse(args, ["name"], {}).positionals as [string];
  const all = checks(workspace);
  if (!(name in all)) {
    throw new Refusal(`check not found: ${name}`);
  }
  delete all[name];
  workspace.touch("types.json");
});

export const check: Command = group(usage, { add, remove });
