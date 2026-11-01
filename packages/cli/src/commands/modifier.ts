import type { Json, Workspace } from "../workspace.js";
import type { Command } from "./context.js";
import {
  editCommand,
  group,
  isObject,
  list,
  pairs,
  parse,
  Refusal,
  reorder,
  UsageError,
} from "./edit.js";
import { modifierList } from "./reading.js";

const usage = `Usage: dxn prototype modifier <subcommand>

A modifier is an accessory that changes some of a profile's values, such as a
keyboard with a trackpad on a tablet (pointer=mouse, keyboard=keyboard). It is
on the profiles it names, and makes a profile <profile>+<modifier> for each,
which filters and tables name like any other.

Subcommands:
  list                               List every modifier
  add <name> --on <profile>,... <dimension>=<value>...
                                     Add a modifier in profiles.json
  remove <name>                      Remove a modifier
`;

function modifiers(workspace: Workspace): Json {
  const file = workspace.read("profiles.json");
  if (file === undefined) throw new Refusal("no profiles.json; add a profile first");
  if (!isObject(file.modifiers)) file.modifiers = {};
  reorder(file, ["$schema", "version", "profiles", "modifiers"]);
  workspace.touch("profiles.json");
  return file.modifiers as Json;
}

const add = editCommand(usage, (workspace, args) => {
  const { values, positionals } = parse(args, ["name"], { on: { type: "string" } }, true);
  const [name, ...assignments] = positionals as [string, ...string[]];
  const on = list(values.on);
  if (on === undefined || on.length === 0) throw new UsageError("--on is required");
  if (assignments.length === 0) {
    throw new UsageError("give at least one <dimension>=<value>");
  }
  const all = modifiers(workspace);
  if (name in all) {
    throw new Refusal(`modifier "${name}" already exists`);
  }
  all[name] = {
    on,
    sets: Object.fromEntries(pairs(assignments).sort(([a], [b]) => (a < b ? -1 : 1))),
  };
});

const remove = editCommand(usage, (workspace, args) => {
  const [name] = parse(args, ["name"], {}).positionals as [string];
  const file = workspace.read("profiles.json");
  const all = isObject(file?.modifiers) ? file.modifiers : {};
  if (file === undefined || !(name in all)) {
    throw new Refusal(`modifier not found: ${name}`);
  }
  delete all[name];
  if (Object.keys(all).length === 0) delete file.modifiers;
  workspace.touch("profiles.json");
});

export const modifier: Command = group(usage, { list: modifierList, add, remove });
