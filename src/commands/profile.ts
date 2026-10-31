import type { Json, Workspace } from "../workspace.js";
import type { Command } from "./context.js";
import { editCommand, group, isObject, parse, Refusal, UsageError } from "./edit.js";
import { profileListCommand } from "./reading.js";

const usage = `Usage: dimensions profile <subcommand>

A profile is a combination of dimension values that exists, such as phone
(breakpoint=base, pointer=touch, keyboard=no-keyboard). Profiles may share a
combination. Once profiles exist, only their combinations do, and commands fill
those dimensions in from the one combination that fits what you give.
Accessories that change some profiles' values are modifiers; see
"dimensions modifier".

Subcommands:
  list                               List every profile and its values
  add <name> <dimension>=<value>... [<name> <dimension>=<value>...]
                                     Add one or more profiles in profiles.json; add
                                     profiles that belong together in one step
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

// Several profiles, each a name followed by its <dimension>=<value> pairs.
const add = editCommand(usage, (workspace, args) => {
  const { positionals } = parse(args, ["name"], {}, true);
  const adding: [string, Json][] = [];
  for (const arg of positionals) {
    const at = arg.indexOf("=");
    if (at < 0) {
      adding.push([arg, {}]);
      continue;
    }
    if (at === 0 || at === arg.length - 1) {
      throw new UsageError(`expected <dimension>=<value>, got ${JSON.stringify(arg)}`);
    }
    (adding.at(-1) as [string, Json])[1][arg.slice(0, at)] = arg.slice(at + 1);
  }
  const all = profiles(workspace, true);
  for (const [name, values] of adding) {
    if (Object.keys(values).length === 0) {
      throw new UsageError(`give at least one <dimension>=<value> for profile "${name}"`);
    }
    if (name in all || adding.filter(([other]) => other === name).length > 1) {
      throw new Refusal(`profile "${name}" already exists`);
    }
    all[name] = Object.fromEntries(Object.entries(values).sort(([a], [b]) => (a < b ? -1 : 1)));
  }
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
