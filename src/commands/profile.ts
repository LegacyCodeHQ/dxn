import type { Json, Workspace } from "../workspace.js";
import type { Command } from "./context.js";
import { editCommand, group, isObject, parse, Refusal, UsageError } from "./edit.js";
import { profileListCommand } from "./reading.js";

const usage = `Usage: dimensions profile <subcommand>

A profile is a combination of dimension values that exists, such as phone
(breakpoint=base, pointer=touch, keyboard=no-keyboard). Once profiles exist,
only their combinations do, and commands fill those dimensions in from the one
profile that fits what you give.

Subcommands:
  list                               List every profile and its values
  add <name> <dimension>=<value>...  Add a profile in profiles.json
  remove <name>                      Remove a profile
`;

function profiles(workspace: Workspace, create: boolean): Json {
  let file = workspace.read("profiles.json");
  if (file === undefined) {
    if (!create) throw new Refusal("no profiles.json; add a profile first");
    file = { version: 1, profiles: {} };
    workspace.write("profiles.json", file);
  }
  if (!isObject(file.profiles)) file.profiles = {};
  workspace.touch("profiles.json");
  return file.profiles as Json;
}

const add = editCommand(usage, (workspace, args) => {
  const [name, ...rest] = parse(args, ["name"], {}, true).positionals as [string, ...string[]];
  if (rest.length === 0) {
    throw new UsageError("give at least one <dimension>=<value>");
  }
  const values: Json = {};
  for (const arg of rest) {
    const at = arg.indexOf("=");
    if (at <= 0 || at === arg.length - 1) {
      throw new UsageError(`expected <dimension>=<value>, got ${JSON.stringify(arg)}`);
    }
    values[arg.slice(0, at)] = arg.slice(at + 1);
  }
  const all = profiles(workspace, true);
  if (name in all) {
    throw new Refusal(`profile "${name}" already exists`);
  }
  all[name] = Object.fromEntries(Object.entries(values).sort(([a], [b]) => (a < b ? -1 : 1)));
});

const remove = editCommand(usage, (workspace, args) => {
  const [name] = parse(args, ["name"], {}).positionals as [string];
  const all = profiles(workspace, false);
  if (!(name in all)) {
    throw new Refusal(`profile not found: ${name}`);
  }
  delete all[name];
});

export const profile: Command = group(usage, { list: profileListCommand, add, remove });
