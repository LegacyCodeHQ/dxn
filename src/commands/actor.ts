import type { Command } from "./context.js";
import { editCommand, group, isObject, parse, Refusal } from "./edit.js";
import { actorList } from "./reading.js";

const usage = `Usage: dimensions actor <subcommand>

An actor is a role that does work against the model, such as a design agent
that draws frames for it. Actors are declared in actors.json.

Subcommands:
  list                               List every actor
  add <name>                         Declare an actor, such as design-agent
  remove <name>                      Remove an actor that no evidence or record names
`;

const add = editCommand(usage, (workspace, args) => {
  const [name] = parse(args, ["name"], {}).positionals as [string];
  let file = workspace.read("actors.json");
  if (file === undefined) {
    file = { version: 1, actors: {} };
    workspace.write("actors.json", file);
  }
  if (!isObject(file.actors)) file.actors = {};
  const actors = file.actors as Record<string, unknown>;
  if (name in actors) {
    throw new Refusal(`actor "${name}" already exists`);
  }
  actors[name] = {};
  workspace.touch("actors.json");
});

const remove = editCommand(usage, (workspace, args) => {
  const [name] = parse(args, ["name"], {}).positionals as [string];
  const file = workspace.read("actors.json");
  const actors = isObject(file?.actors) ? file.actors : {};
  if (file === undefined || !(name in actors)) {
    throw new Refusal(`actor not found: ${name}`);
  }
  delete actors[name];
  workspace.touch("actors.json");
});

export const actor: Command = group(usage, { list: actorList, add, remove });
